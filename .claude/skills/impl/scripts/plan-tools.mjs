#!/usr/bin/env node
/**
 * Deterministic helpers for the /impl skill — parse a docs/plans/<slug>.md
 * (template shape: `### U<n> — title` blocks with a `| Field | Value |` table)
 * and keep the run state. Usage:
 *
 *   node .claude/skills/impl/scripts/plan-tools.mjs waves <plan>
 *   node .claude/skills/impl/scripts/plan-tools.mjs unit  <plan> <U-id>
 *   node .claude/skills/impl/scripts/plan-tools.mjs owner <plan> <file…>
 *   node .claude/skills/impl/scripts/plan-tools.mjs state get <slug>
 *   node .claude/skills/impl/scripts/plan-tools.mjs state set <slug> <key>=<json|text>…
 *
 * Output is plain text (waves, unit) or JSON (owner, state) for the
 * orchestrator to read. Exit 2 on bad usage / unknown unit / unparsable plan.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const PACKAGES = ['server', 'client', 'reviewer-core', 'e2e', 'mcp'];

/** Kind cell → agent. First recognised word wins; Wave 0 is always the orchestrator. */
const KIND_AGENT = [
  [/\bbackend\b/i, 'implementer-backend'],
  [/\bui\b/i, 'implementer-ui'],
  [/\b(engine|e2e|mcp)\b/i, 'implementer'],
];

function fail(msg) {
  console.error(`plan-tools: ${msg}`);
  process.exit(2);
}

export function resolvePlan(arg) {
  if (!arg) fail('missing <plan> (path or slug)');
  const candidates = [arg, path.join('docs/plans', arg), path.join('docs/plans', `${arg}.md`)];
  for (const c of candidates) {
    const abs = path.resolve(REPO, c);
    if (existsSync(abs) && abs.endsWith('.md')) return abs;
  }
  fail(`plan not found: ${arg}`);
}

const cell = (s) => s.trim();

/** Parse the plan into header fields, section line ranges and unit blocks. */
export function parsePlan(text) {
  const lines = text.split(/\r?\n/);
  const header = {};
  const sections = [];
  const units = [];
  let unit = null;
  const closeUnit = (end) => {
    if (unit) { unit.end = end; units.push(unit); unit = null; }
  };
  lines.forEach((line, i) => {
    const sec = /^## (.+)$/.exec(line);
    if (sec) {
      closeUnit(i - 1);
      if (sections.length) sections.at(-1).end = i - 1;
      sections.push({ title: sec[1].trim(), start: i, end: lines.length - 1 });
      return;
    }
    const u = /^### (U\d+[a-z]?)\b\s*[—–-]?\s*(.*)$/.exec(line);
    if (u) {
      closeUnit(i - 1);
      unit = { id: u[1], title: u[2].trim(), start: i, end: lines.length - 1, fields: {} };
      return;
    }
    if (/^### /.test(line)) { closeUnit(i - 1); return; }
    const row = /^\|([^|]+)\|(.*)\|\s*$/.exec(line);
    if (!row) return;
    const key = cell(row[1]);
    if (/^-+$/.test(key) || key === 'Field') return;
    if (unit) unit.fields[key] = cell(row[2]);
    else if (!sections.length) header[key] = cell(row[2]);
  });
  closeUnit(lines.length - 1);
  return { lines, header, sections, units };
}

export function unitWave(u) {
  const m = /\d+/.exec(u.fields.Wave ?? '');
  return m ? Number(m[0]) : null;
}

/** Package → agent; used first, because older plans label mcp/engine work "backend". */
const PACKAGE_AGENT = {
  server: 'implementer-backend',
  client: 'implementer-ui',
  'reviewer-core': 'implementer',
  e2e: 'implementer',
  mcp: 'implementer',
};

export function unitAgent(u) {
  if (unitWave(u) === 0 || /orchestrator/i.test(`${u.title} ${u.fields.Wave ?? ''}`)) return 'orchestrator';
  // `**/…` paths carry no package — they don't vote.
  const owned = ownedPaths(u).filter((p) => !p.startsWith('**/'));
  // Anything outside the five packages (.claude/**, docs, root config) is the orchestrator's.
  if (owned.some((p) => !PACKAGE_AGENT[p.split('/')[0]])) return 'orchestrator';
  const agents = new Set(owned.map((p) => PACKAGE_AGENT[p.split('/')[0]]));
  if (agents.size === 1) return [...agents][0];
  if (!ownedPaths(u).length) return 'orchestrator';
  const kind = u.fields.Kind ?? '';
  for (const [re, agent] of KIND_AGENT) if (re.test(kind)) return agent;
  return 'orchestrator';
}

const ownsField = (u) => u.fields['Owns (create/modify)'] ?? u.fields.Owns ?? '';

/** `a/{b,c}.ts` → [`a/b.ts`, `a/c.ts`] (one level, repeated until stable). */
export function expandBraces(p) {
  const m = /\{([^{}]*)\}/.exec(p);
  if (!m) return [p];
  return m[1].split(',').flatMap((alt) => expandBraces(p.slice(0, m.index) + alt.trim() + p.slice(m.index + m[0].length)));
}

/**
 * Owned paths of a unit: every backticked token that looks like a path, braces
 * expanded. A token without a package prefix inherits the package of the
 * previous prefixed token (plans write `reviewer-core/src/a.ts`, `test/b.ts`).
 */
export function ownedPaths(u) {
  const out = [];
  let pkg = null;
  for (const [, raw] of ownsField(u).matchAll(/`([^`]+)`/g)) {
    // `…/X.tsx` (elided middle) → `**/X.tsx`, which then inherits the package prefix.
    const tok = raw.trim().replace(/^\.\//, '').replace(/^(?:…|\.\.\.)\//, '**/');
    if (!/[/.]/.test(tok) || /\s/.test(tok)) continue;
    for (const p of expandBraces(tok)) {
      const first = p.split('/')[0];
      if (PACKAGES.includes(first)) { pkg = first; out.push(p); }
      // Root-looking (`docs/…`, `specs/…`, `AGENTS.md`) but inside a package's list:
      // the package copy wins unless only the root path exists on disk.
      else if (/^(docs|specs|scripts|\.claude|\.github)\//.test(p) || !p.includes('/') && /\.(md|json|ya?ml)$/.test(p)) {
        out.push(pkg && !existsSync(path.join(REPO, p.replace(/\*.*$/, ''))) ? `${pkg}/${p}` : p);
      } else out.push(pkg ? `${pkg}/${p}` : p);
    }
  }
  return [...new Set(out)];
}

function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i];
    if (ch === '*' && glob[i + 1] === '*') { re += '.*'; i += glob[i + 2] === '/' ? 2 : 1; }
    else if (ch === '*') re += '[^/]*';
    else re += ch.replace(/[.+?^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

/** How a repo-relative file matches an owned path: exact > glob > suffix (prefix-less tokens). */
export function matchKind(file, owned) {
  if (file === owned) return 'exact';
  if (owned.includes('*') && globToRegExp(owned).test(file)) return 'glob';
  if (owned.endsWith('/') && file.startsWith(owned)) return 'glob';
  if (!PACKAGES.includes(owned.split('/')[0]) && owned.includes('/') && file.endsWith(`/${owned}`)) return 'suffix';
  return null;
}

export function owners(plan, files) {
  return files.map((f) => {
    const file = f.replaceAll('\\', '/').replace(/^\.\//, '');
    const hits = [];
    for (const u of plan.units) {
      for (const o of ownedPaths(u)) {
        const kind = matchKind(file, o);
        if (kind) { hits.push({ unit: u.id, wave: unitWave(u), agent: unitAgent(u), match: kind, owned: o }); break; }
      }
    }
    const best = hits.filter((h) => h.match === 'exact').length ? hits.filter((h) => h.match === 'exact') : hits;
    // A file is usually re-owned by later waves (single-agent plans): the latest wave is the current owner.
    const latest = best.length ? Math.max(...best.map((h) => h.wave ?? -1)) : null;
    const current = best.filter((h) => (h.wave ?? -1) === latest);
    return {
      file,
      owner: current.length === 1 ? current[0].unit : null,
      agent: current.length === 1 ? current[0].agent : 'orchestrator',
      status: current.length === 1 ? 'owned' : current.length ? 'ambiguous' : 'unowned',
      candidates: hits,
    };
  });
}

// ── commands ─────────────────────────────────────────────────────────────────

function cmdWaves(planArg) {
  const file = resolvePlan(planArg);
  const plan = parsePlan(readFileSync(file, 'utf8'));
  if (!plan.units.length) fail(`no "### U<n>" unit blocks in ${path.relative(REPO, file)} — free-form plan, /impl needs the template shape`);
  console.log(`plan: ${path.relative(REPO, file).replaceAll('\\', '/')}`);
  for (const k of ['Status', 'Execution mode', 'Requirements source']) if (plan.header[k]) console.log(`${k}: ${plan.header[k]}`);
  const byWave = new Map();
  for (const u of plan.units) {
    const w = unitWave(u);
    if (!byWave.has(w)) byWave.set(w, []);
    byWave.get(w).push(u);
  }
  for (const w of [...byWave.keys()].sort((a, b) => (a ?? 99) - (b ?? 99))) {
    console.log(`\nWave ${w ?? '?'}:`);
    for (const u of byWave.get(w)) {
      console.log(`  ${u.id.padEnd(4)} ${unitAgent(u).padEnd(20)} ${u.title}`);
      console.log(`       kind: ${u.fields.Kind ?? '?'} · depends: ${u.fields['Depends on'] ?? '?'} · owns ${ownedPaths(u).length} path(s)`);
    }
  }
}

function cmdUnit(planArg, id) {
  if (!id) fail('missing <U-id>');
  const file = resolvePlan(planArg);
  const plan = parsePlan(readFileSync(file, 'utf8'));
  const u = plan.units.find((x) => x.id.toLowerCase() === id.toLowerCase());
  if (!u) fail(`unit ${id} not in plan (have: ${plan.units.map((x) => x.id).join(', ') || 'none'})`);
  const rel = path.relative(REPO, file).replaceAll('\\', '/');
  const contracts = plan.sections.find((s) => /^3\.|contracts/i.test(s.title));
  console.log(`<!-- ${rel} · ${u.id} · lines ${u.start + 1}-${u.end + 1} · agent: ${unitAgent(u)} -->`);
  for (const k of ['Goal', 'Execution mode', 'Requirements source']) if (plan.header[k]) console.log(`- ${k}: ${plan.header[k]}`);
  if (contracts) console.log(`- §3 Contracts: ${rel} lines ${contracts.start + 1}-${contracts.end + 1} (read only the contracts this unit Consumes/Produces)`);
  console.log('');
  console.log(plan.lines.slice(u.start, u.end + 1).join('\n').trimEnd());
}

function cmdOwner(planArg, files) {
  if (!files.length) fail('missing <file…>');
  const plan = parsePlan(readFileSync(resolvePlan(planArg), 'utf8'));
  console.log(JSON.stringify(owners(plan, files), null, 2));
}

export function statePath(slug) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug ?? '')) fail(`bad slug "${slug ?? ''}" (kebab-case expected)`);
  return path.join(REPO, '.claude/.impl', slug, 'state.json');
}

function cmdState(op, slug, pairs) {
  const file = statePath(slug);
  const state = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  if (op === 'get') { console.log(JSON.stringify(state, null, 2)); return; }
  if (op !== 'set') fail('state <get|set> <slug> [key=value…]');
  if (!pairs.length) fail('state set needs key=value pairs');
  for (const p of pairs) {
    const eq = p.indexOf('=');
    if (eq < 1) fail(`bad pair "${p}"`);
    const raw = p.slice(eq + 1);
    let value;
    try { value = JSON.parse(raw); } catch { value = raw; }
    state[p.slice(0, eq)] = value;
  }
  state.updatedAt = new Date().toISOString();
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
  console.log(JSON.stringify(state, null, 2));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'waves') cmdWaves(rest[0]);
  else if (cmd === 'unit') cmdUnit(rest[0], rest[1]);
  else if (cmd === 'owner') cmdOwner(rest[0], rest.slice(1));
  else if (cmd === 'state') cmdState(rest[0], rest[1], rest.slice(2));
  else fail('usage: plan-tools.mjs <waves|unit|owner|state> …');
}
