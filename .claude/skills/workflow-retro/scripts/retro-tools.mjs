#!/usr/bin/env node
/**
 * Deterministic, read-only helpers for the /workflow-retro skill. Parses Claude
 * Code session journals and the retro ledger. Usage:
 *
 *   node .claude/skills/workflow-retro/scripts/retro-tools.mjs analyze [options]
 *     --session <id|path>   main transcript (<id>.jsonl); default: newest in the project dir
 *     --project-dir <dir>   ~/.claude/projects/<slug>; default: derived from the cwd
 *     --since <ISO>         only agents launched at/after this time (scope one batch)
 *     --prices <file>       JSON {model_substr: {in,out,cache_read,cache_write,cache_write_1h}}
 *                           in $/Mtok (cache_write = 5-minute tier; cache_write_1h falls back
 *                           to cache_write and the result is flagged `cache_1h_unpriced`)
 *     --json                machine-readable output (default: human table)
 *
 *   node .claude/skills/workflow-retro/scripts/retro-tools.mjs trend <analysis.json>
 *     --kind <kind> [--ledger docs/retros/ledger.md]
 *     → JSON {row, comparison}: the ledger row to append (outcome / recommendation
 *       left as placeholders) and this run vs the median of earlier runs of the same kind.
 *
 * Journal facts this relies on (verified on Claude Code 2.1.x):
 * - Subagent journals are stored FLAT in <session>/subagents/agent-<id>.jsonl, each with a
 *   sibling .meta.json {agentType, description, toolUseId, spawnDepth}. spawnDepth > 1 =
 *   nested agent; a parent's in-context <usage> EXCLUDES its children.
 * - One API response is split over several journal lines (one per content block) that share
 *   message.id and REPEAT the usage object. Summing per line over-counts (cache-read most of
 *   all), so usage is taken once per message.id — from the line with the largest output.
 * - usage.cache_creation splits cache writes into ephemeral_5m / ephemeral_1h (the main session
 *   usually writes the 1h tier, subagents the 5m tier) — priced separately.
 * - A failed Bash command is NOT marked is_error and its exit code is not stored; failures are
 *   detected from the output text (FAIL_RE) and counted as `command-failed`.
 * - A resumed agent (SendMessage) appends to the same journal; the gap before each resume prompt
 *   is idle time, excluded from `active_s` (used for wall-clock, parallelism, critical path).
 * Exit 2 on bad usage / no journals found.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const UNVERIFIED_RE = /\b(inference|inferred|not verified|unverified|did not (?:read|check|verify)|assumption)\b/gi;
const READ_TOOLS = new Set(['Read', 'NotebookRead']);
const WRITE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit']);
const TREND_FLAG = 1.5;
const FAIL_RE = /^(fatal|error)[:\s]|command not found|No such file or directory|Traceback \(most recent call last\)|^npm ERR!|ERR_PNPM/im;

function fail(msg) {
  console.error(`retro-tools: ${msg}`);
  process.exit(2);
}

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[key] = true;
      else out[key] = argv[++i];
    } else out._.push(a);
  }
  return out;
}

/** ~/.claude/projects/<slug>: every ':' '\' '/' of the absolute cwd becomes '-'. */
export function projectDirFor(cwd) {
  return path.join(os.homedir(), '.claude', 'projects', cwd.replace(/[:\\/]/g, '-'));
}

export function readJsonl(file) {
  if (!existsSync(file)) return [];
  const out = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      /* torn last line of a live journal — skip */
    }
  }
  return out;
}

const blocks = (o) => (Array.isArray(o?.message?.content) ? o.message.content : []);
const ms = (ts) => (ts ? Date.parse(ts) : NaN);
const normPath = (p) => String(p).replace(/\\/g, '/').toLowerCase();

/** Usage summed once per message.id (see header). */
export function usageOf(lines) {
  const byId = new Map();
  for (const o of lines) {
    const u = o?.message?.usage;
    if (o.type !== 'assistant' || !u) continue;
    const id = o.message.id ?? o.uuid;
    const prev = byId.get(id);
    if (!prev || (u.output_tokens ?? 0) >= (prev.output_tokens ?? 0)) byId.set(id, u);
  }
  const t = { input: 0, output: 0, cache_read: 0, cache_write: 0, cache_write_1h: 0, turns: byId.size };
  for (const u of byId.values()) {
    t.input += u.input_tokens ?? 0;
    t.output += u.output_tokens ?? 0;
    t.cache_read += u.cache_read_input_tokens ?? 0;
    t.cache_write += u.cache_creation_input_tokens ?? 0;
    t.cache_write_1h += u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  }
  return t;
}

export function classifyError(text) {
  const s = String(text).toLowerCase();
  if (/declined|denied|doesn't want to proceed|not allowed|permission/.test(s)) return 'denied';
  if (/timed? ?out|timeout/.test(s)) return 'timeout';
  if (/not found|no such file|missing|couldn't open|enoent|does not exist/.test(s)) return 'not-found';
  if (/must read|has not been read|modified since/.test(s)) return 'stale-read';
  if (/exit code|command failed|fatal:|error:/.test(s)) return 'command-failed';
  return 'other';
}

const resultText = (b) =>
  typeof b.content === 'string'
    ? b.content
    : Array.isArray(b.content)
      ? b.content.map((c) => c.text ?? '').join(' ')
      : '';

/** A prompt line (user text, not a tool result) — the start of a turn or of a resume. */
const isPrompt = (o) =>
  o.type === 'user' &&
  (typeof o.message?.content === 'string' || (blocks(o).length > 0 && !blocks(o).some((b) => b.type === 'tool_result')));

/** Bash output text from the tool_result block and/or the journal's toolUseResult. */
const bashText = (o, b) => {
  const r = o.toolUseResult;
  const extra = r && typeof r === 'object' ? `${r.stdout ?? ''}\n${r.stderr ?? ''}` : '';
  return `${resultText(b)}\n${extra}`;
};

/** Per-journal facts: tools, reads, writes, errors, models, final report markers, span, idle. */
export function journalFacts(lines) {
  const f = {
    models: new Set(),
    tools: {},
    toolCalls: 0,
    reads: [],
    writes: {},
    errors: [],
    first: NaN,
    last: NaN,
    idle_ms: 0,
    segments: [],
    finalText: '',
  };
  const toolName = new Map();
  let prevT = NaN;
  let segStart = NaN;
  let prompts = 0;
  for (const o of lines) {
    const t = ms(o.timestamp);
    if (isPrompt(o) && prompts++ > 0 && !Number.isNaN(t) && !Number.isNaN(prevT) && t > prevT) {
      f.idle_ms += t - prevT;
      f.segments.push([segStart, prevT]);
      segStart = t;
    }
    if (!Number.isNaN(t) && Number.isNaN(segStart)) segStart = t;
    if (!Number.isNaN(t)) {
      if (Number.isNaN(f.first) || t < f.first) f.first = t;
      if (Number.isNaN(f.last) || t > f.last) f.last = t;
      prevT = t;
    }
    if (o.type === 'assistant' && o.message?.model && !o.message.model.startsWith('<')) f.models.add(o.message.model);
    for (const b of blocks(o)) {
      if (b.type === 'tool_result' && !b.is_error && toolName.get(b.tool_use_id) === 'Bash') {
        const text = bashText(o, b);
        const m = text.match(FAIL_RE);
        if (m) f.errors.push({ kind: 'command-failed', text: text.slice(Math.max(0, m.index), m.index + 160).trim() });
      }
      if (b.type === 'tool_use') {
        toolName.set(b.id, b.name);
        f.toolCalls++;
        f.tools[b.name] = (f.tools[b.name] ?? 0) + 1;
        const p = b.input?.file_path ?? b.input?.notebook_path;
        if (p && READ_TOOLS.has(b.name)) f.reads.push(p);
        if (p && WRITE_TOOLS.has(b.name)) {
          const k = normPath(p);
          f.writes[k] ??= { path: p, write: 0, edit: 0 };
          f.writes[k][b.name === 'Write' ? 'write' : 'edit']++;
        }
      } else if (b.type === 'tool_result' && b.is_error) {
        const text = resultText(b).slice(0, 160);
        f.errors.push({ kind: classifyError(text), text });
      } else if (b.type === 'text' && o.type === 'assistant' && b.text?.trim()) {
        f.finalText = b.text;
      }
    }
  }
  if (!Number.isNaN(segStart) && !Number.isNaN(prevT)) f.segments.push([segStart, prevT]);
  f.unverified = (f.finalText.match(UNVERIFIED_RE) ?? []).length;
  return f;
}

/** Main transcript: launches (Agent), resumes (SendMessage), human waits, own facts. */
export function mainFacts(lines) {
  const launches = [];
  const resumes = {};
  const asks = new Map();
  const waits = [];
  for (const o of lines) {
    for (const b of blocks(o)) {
      if (b.type === 'tool_use' && b.name === 'Agent') {
        launches.push({
          toolUseId: b.id,
          messageId: o.message?.id,
          ts: o.timestamp,
          type: b.input?.subagent_type ?? 'general-purpose',
          description: b.input?.description ?? '',
          background: b.input?.run_in_background !== false,
        });
      } else if (b.type === 'tool_use' && b.name === 'SendMessage' && b.input?.to) {
        resumes[b.input.to] = (resumes[b.input.to] ?? 0) + 1;
      } else if (b.type === 'tool_use' && b.name === 'AskUserQuestion') {
        asks.set(b.id, o.timestamp);
      } else if (b.type === 'tool_result' && asks.has(b.tool_use_id)) {
        const s = (ms(o.timestamp) - ms(asks.get(b.tool_use_id))) / 1000;
        if (s >= 0) waits.push(s);
      }
    }
  }
  return { launches, resumes, humanWait_s: round(waits.reduce((a, b) => a + b, 0)), questions: waits.length };
}

const round = (n, d = 1) => (n == null || Number.isNaN(n) ? null : Math.round(n * 10 ** d) / 10 ** d);

export function costOf(usage, model, prices) {
  if (!prices || !model) return null;
  const key = Object.keys(prices).find((k) => model.includes(k));
  if (!key) return null;
  const p = prices[key];
  const M = 1e6;
  const w1h = usage.cache_write_1h ?? 0;
  return (
    (usage.input / M) * (p.in ?? 0) +
    (usage.output / M) * (p.out ?? 0) +
    (usage.cache_read / M) * (p.cache_read ?? 0) +
    ((usage.cache_write - w1h) / M) * (p.cache_write ?? 0) +
    (w1h / M) * (p.cache_write_1h ?? p.cache_write ?? 0)
  );
}

/** True when 1h-tier cache writes were priced at the 5m rate (no cache_write_1h given). */
const unpriced1h = (usage, model, prices) => {
  if (!prices || !model || !usage.cache_write_1h) return false;
  const key = Object.keys(prices).find((k) => model.includes(k));
  return Boolean(key) && prices[key].cache_write_1h == null;
};

/** Total length of the union of [start, end] intervals (ms). */
export function unionLength(segments) {
  const s = segments.filter(([a, b]) => !Number.isNaN(a) && !Number.isNaN(b) && b >= a).sort((x, y) => x[0] - y[0]);
  let total = 0;
  let cur = null;
  for (const [a, b] of s) {
    if (!cur || a > cur[1]) {
      if (cur) total += cur[1] - cur[0];
      cur = [a, b];
    } else cur[1] = Math.max(cur[1], b);
  }
  return cur ? total + cur[1] - cur[0] : 0;
}

const hitRatio = (u) => {
  const side = u.input + u.cache_read + u.cache_write;
  return side ? round(u.cache_read / side, 3) : 0;
};

function newestSession(dir) {
  const files = readdirSync(dir)
    .filter((n) => n.endsWith('.jsonl'))
    .map((n) => ({ n, t: statSync(path.join(dir, n)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return files[0] ? path.join(dir, files[0].n) : null;
}

export function analyze({ sessionFile, since, prices }) {
  const sessionDir = sessionFile.replace(/\.jsonl$/, '');
  const subDir = path.join(sessionDir, 'subagents');
  const mainLines = readJsonl(sessionFile);
  const main = mainFacts(mainLines);
  const sinceMs = since ? Date.parse(since) : NaN;
  const launchById = new Map(main.launches.map((l) => [l.toolUseId, l]));
  const parallelGroups = new Map();
  for (const l of main.launches) {
    if (!l.messageId) continue;
    parallelGroups.set(l.messageId, (parallelGroups.get(l.messageId) ?? 0) + 1);
  }

  const agents = [];
  const files = existsSync(subDir) ? readdirSync(subDir).filter((n) => /^agent-.*\.jsonl$/.test(n)) : [];
  for (const name of files) {
    const id = name.slice('agent-'.length, -'.jsonl'.length);
    const lines = readJsonl(path.join(subDir, name));
    if (!lines.length) continue;
    let meta = {};
    try {
      meta = JSON.parse(readFileSync(path.join(subDir, `agent-${id}.meta.json`), 'utf8'));
    } catch {
      /* meta optional */
    }
    const facts = journalFacts(lines);
    if (!Number.isNaN(sinceMs) && facts.first < sinceMs) continue;
    const usage = usageOf(lines);
    const model = [...facts.models][0] ?? null;
    const launch = launchById.get(meta.toolUseId);
    const cost = costOf(usage, model, prices);
    agents.push({
      id,
      type: meta.agentType ?? launch?.type ?? '?',
      description: meta.description ?? launch?.description ?? '',
      depth: meta.spawnDepth ?? 1,
      model,
      parallelWith: launch?.messageId ? (parallelGroups.get(launch.messageId) ?? 1) - 1 : 0,
      resumes: main.resumes[id] ?? 0,
      ...usage,
      cache_hit: hitRatio(usage),
      tool_calls: facts.toolCalls,
      tools: facts.tools,
      errors: facts.errors,
      rewrites: Object.values(facts.writes).filter((w) => w.write > 1),
      unverified_markers: facts.unverified,
      span_s: round((facts.last - facts.first) / 1000),
      idle_s: round(facts.idle_ms / 1000),
      active_s: round((facts.last - facts.first - facts.idle_ms) / 1000),
      started: Number.isNaN(facts.first) ? null : new Date(facts.first).toISOString(),
      cost_usd: cost == null ? null : round(cost, 4),
      cache_1h_unpriced: unpriced1h(usage, model, prices),
      _reads: facts.reads,
      _segments: facts.segments,
    });
  }
  agents.sort((a, b) => String(a.started).localeCompare(String(b.started)));

  // Main session itself (the orchestrator) — its tokens are part of the run's cost.
  const mainSlice = Number.isNaN(sinceMs) ? mainLines : mainLines.filter((o) => !(ms(o.timestamp) < sinceMs));
  const mainF = journalFacts(mainSlice);
  const mainUsage = usageOf(mainSlice);
  const mainModel = [...mainF.models][0] ?? null;
  const orchestrator = {
    model: mainModel,
    ...mainUsage,
    cache_hit: hitRatio(mainUsage),
    tool_calls: mainF.toolCalls,
    errors: mainF.errors,
    cost_usd: round(costOf(mainUsage, mainModel, prices), 4),
    cache_1h_unpriced: unpriced1h(mainUsage, mainModel, prices),
  };

  // Duplicated reads: same file read by ≥ 2 agents (orchestrator counts as one reader).
  const readers = new Map();
  const addReads = (who, list) => {
    for (const p of list) {
      const k = normPath(p);
      const e = readers.get(k) ?? { path: p, readers: new Set(), reads: 0 };
      e.readers.add(who);
      e.reads++;
      readers.set(k, e);
    }
  };
  addReads('main', mainF.reads);
  for (const a of agents) addReads(a.id, a._reads);
  const duplicated = [...readers.values()]
    .filter((e) => e.readers.size > 1)
    .map((e) => {
      let tokens = null;
      try {
        tokens = Math.ceil(statSync(e.path).size / 4) * (e.reads - 1);
      } catch {
        /* file gone — tokens unknown */
      }
      return { path: e.path, readers: e.readers.size, reads: e.reads, wasted_tokens_est: tokens };
    })
    .sort((a, b) => (b.wasted_tokens_est ?? 0) - (a.wasted_tokens_est ?? 0));
  const segments = agents.flatMap((a) => a._segments);
  for (const a of agents) {
    delete a._reads;
    delete a._segments;
  }

  const all = [...agents, orchestrator];
  const sum = (k) => all.reduce((s, a) => s + (a[k] ?? 0), 0);
  const starts = agents.map((a) => ms(a.started)).filter((t) => !Number.isNaN(t));
  const ends = agents.map((a) => ms(a.started) + (a.span_s ?? 0) * 1000).filter((t) => !Number.isNaN(t));
  // elapsed = first launch → last agent line (includes human think-time between resumes);
  // busy = time at least one agent was actually working; parallelism = Σ active ÷ busy.
  const elapsed = starts.length ? (Math.max(...ends) - Math.min(...starts)) / 1000 : null;
  const busy = unionLength(segments) / 1000;
  const sumActive = agents.reduce((s, a) => s + (a.active_s ?? 0), 0);
  const critical = agents.reduce((m, a) => ((a.active_s ?? 0) > (m?.active_s ?? -1) ? a : m), null);
  const costs = all.map((a) => a.cost_usd);
  const errorKinds = {};
  for (const e of all.flatMap((a) => a.errors)) errorKinds[e.kind] = (errorKinds[e.kind] ?? 0) + 1;
  const totals = {
    input: sum('input'),
    output: sum('output'),
    cache_read: sum('cache_read'),
    cache_write: sum('cache_write'),
    cache_write_1h: sum('cache_write_1h'),
  };

  return {
    session: path.basename(sessionFile, '.jsonl'),
    since: since ?? null,
    agents,
    orchestrator,
    duplicated_reads: duplicated,
    summary: {
      agents: agents.length,
      nested_agents: agents.filter((a) => a.depth > 1).length,
      models: [...new Set(all.map((a) => a.model).filter(Boolean))],
      ...totals,
      cache_hit: hitRatio(totals),
      tool_calls: sum('tool_calls'),
      tool_errors: errorKinds,
      resumes: agents.reduce((s, a) => s + a.resumes, 0),
      rewrites: agents.reduce((s, a) => s + a.rewrites.length, 0),
      unverified_markers: agents.reduce((s, a) => s + a.unverified_markers, 0),
      human_wait_s: main.humanWait_s,
      questions_to_human: main.questions,
      elapsed_s: round(elapsed),
      wall_s: round(busy),
      parallelism: busy ? round(sumActive / busy, 2) : null,
      critical_path: critical ? { id: critical.id, type: critical.type, active_s: critical.active_s } : null,
      cost_usd: costs.some((c) => c == null) ? null : round(costs.reduce((s, c) => s + c, 0), 4),
      cost_note: all.some((a) => a.cache_1h_unpriced)
        ? '1h-tier cache writes priced at the 5m rate — add cache_write_1h to the price map'
        : null,
    },
  };
}

// ---- ledger / trend ----------------------------------------------------------

export const LEDGER_HEADER = [
  '| date | label | kind | agents | out tok | cache-read | cache hit | wall s | parallelism | cost $ | outcome | top recommendation |',
  '|------|-------|------|--------|---------|------------|-----------|--------|-------------|--------|---------|--------------------|',
];

export function parseLedger(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 10 || cells[0] === 'date' || /^-+$/.test(cells[0])) continue;
    const num = (s) => (s === 'n/a' || s === '' ? null : Number(s));
    rows.push({ date: cells[0], label: cells[1], kind: cells[2], output: num(cells[4]), wall_s: num(cells[7]), cost_usd: num(cells[9]) });
  }
  return rows;
}

const median = (xs) => {
  const v = xs.filter((x) => x != null && !Number.isNaN(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

export function trend(analysis, { kind, label, ledgerText, date }) {
  const s = analysis.summary;
  const prev = parseLedger(ledgerText ?? '').filter((r) => r.kind === kind);
  const comparison = {};
  for (const [k, cur] of [['output', s.output], ['wall_s', s.wall_s], ['cost_usd', s.cost_usd]]) {
    const med = median(prev.map((r) => r[k]));
    const ratio = med && cur != null ? round(cur / med, 2) : null;
    comparison[k] = {
      current: cur,
      median_prev: med,
      ratio,
      flag: ratio == null ? null : ratio >= TREND_FLAG ? 'higher' : ratio <= 1 / TREND_FLAG ? 'lower' : null,
    };
  }
  const v = (x) => (x == null ? 'n/a' : String(x));
  const row = `| ${date} | ${label} | ${kind} | ${s.agents}${s.nested_agents ? ` (${s.nested_agents} nested)` : ''} | ${s.output} | ${s.cache_read} | ${Math.round(s.cache_hit * 100)}% | ${v(s.wall_s)} | ${v(s.parallelism)} | ${v(s.cost_usd)} | <outcome> | <top recommendation> |`;
  return { previous_runs: prev.length, comparison, row };
}

// ---- human output ------------------------------------------------------------

const k = (n) => (n == null ? '-' : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));

function printHuman(r) {
  const s = r.summary;
  console.log(`session ${r.session}${r.since ? ` since ${r.since}` : ''}`);
  console.log('agent (└ nested)            type                 model              out    c-read  hit  tools err resum active');
  for (const a of r.agents) {
    const name = `${'  '.repeat(a.depth - 1)}${a.depth > 1 ? '└ ' : ''}${a.id}`.slice(0, 26).padEnd(27);
    console.log(
      `${name}${a.type.slice(0, 20).padEnd(21)}${String(a.model ?? '?').slice(0, 18).padEnd(19)}${k(a.output).padStart(6)} ${k(a.cache_read).padStart(7)} ${String(Math.round(a.cache_hit * 100)).padStart(3)}% ${String(a.tool_calls).padStart(5)} ${String(a.errors.length).padStart(3)} ${String(a.resumes).padStart(5)} ${String(a.active_s ?? '-').padStart(6)}s${a.idle_s ? ` (+${a.idle_s}s idle)` : ''}`,
    );
  }
  const o = r.orchestrator;
  console.log(`${'main (orchestrator)'.padEnd(27)}${''.padEnd(21)}${String(o.model ?? '?').slice(0, 18).padEnd(19)}${k(o.output).padStart(6)} ${k(o.cache_read).padStart(7)} ${String(Math.round(o.cache_hit * 100)).padStart(3)}% ${String(o.tool_calls).padStart(5)} ${String(o.errors.length).padStart(3)}`);
  console.log(
    `TOTAL agents=${s.agents} (nested=${s.nested_agents}) out=${k(s.output)} cache_read=${k(s.cache_read)} hit=${Math.round(s.cache_hit * 100)}% tools=${s.tool_calls} errors=${JSON.stringify(s.tool_errors)}`,
  );
  console.log(
    `      busy=${s.wall_s}s elapsed=${s.elapsed_s}s parallelism=${s.parallelism}x critical=${s.critical_path?.type ?? '-'} resumes=${s.resumes} rewrites=${s.rewrites} unverified=${s.unverified_markers} human_wait=${s.human_wait_s}s/${s.questions_to_human}q cost=${s.cost_usd ?? 'n/a (pass --prices)'}${s.cost_note ? ` (${s.cost_note})` : ''}`,
  );
  if (r.duplicated_reads.length) {
    console.log('duplicated reads:');
    for (const d of r.duplicated_reads.slice(0, 10)) console.log(`  ${d.path} — ${d.readers} readers, ${d.reads} reads, ~${k(d.wasted_tokens_est)} tok re-read`);
  }
}

// ---- CLI ---------------------------------------------------------------------

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  if (cmd === 'analyze') {
    const dir = args['project-dir'] ?? projectDirFor(process.cwd());
    let sessionFile = null;
    if (typeof args.session === 'string') {
      sessionFile = args.session.endsWith('.jsonl') ? args.session : path.join(dir, `${args.session}.jsonl`);
    } else if (existsSync(dir)) sessionFile = newestSession(dir);
    if (!sessionFile || !existsSync(sessionFile)) fail(`session transcript not found (looked in ${dir})`);
    const prices = typeof args.prices === 'string' ? JSON.parse(readFileSync(args.prices, 'utf8')) : null;
    const r = analyze({ sessionFile, since: typeof args.since === 'string' ? args.since : undefined, prices });
    if (args.json) console.log(JSON.stringify(r, null, 2));
    else printHuman(r);
    return;
  }
  if (cmd === 'trend') {
    const file = args._[0];
    if (!file || !existsSync(file)) fail('trend needs <analysis.json> (output of `analyze --json`)');
    if (typeof args.kind !== 'string') fail('trend needs --kind <kind>');
    const ledger = typeof args.ledger === 'string' ? args.ledger : 'docs/retros/ledger.md';
    const out = trend(JSON.parse(readFileSync(file, 'utf8')), {
      kind: args.kind,
      label: typeof args.label === 'string' ? args.label : args.kind,
      ledgerText: existsSync(ledger) ? readFileSync(ledger, 'utf8') : '',
      date: new Date().toISOString().slice(0, 10),
    });
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  fail('usage: retro-tools.mjs analyze [--session <id>] [--since <ISO>] [--prices <file>] [--json] | trend <analysis.json> --kind <kind> [--label <l>] [--ledger <file>]');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
