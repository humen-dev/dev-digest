/**
 * pr-self-review — glob matching, diff parsing, routing, finding shaping.
 * No dependencies: everything here must run from a hook on any platform.
 */
import { readFileSync } from 'node:fs';

/** Windows paths never reach a glob: normalize once, at the boundary. */
export const posix = (p) => String(p).replace(/\\/g, '/');

const RE_CACHE = new Map();
const SPECIAL = '.+^${}()|[]\\';

/** Minimal glob -> RegExp. Supports `**`, `*`, `?` and `{a,b}` alternation. */
export function globToRegex(glob) {
  const cached = RE_CACHE.get(glob);
  if (cached) return cached;
  let re = '';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') { re += '(?:[^/]*/)*'; i += 3; continue; }
        re += '.*'; i += 2; continue;
      }
      re += '[^/]*'; i += 1; continue;
    }
    if (c === '?') { re += '[^/]'; i += 1; continue; }
    if (c === '{') {
      const close = glob.indexOf('}', i);
      if (close !== -1) {
        const alts = glob.slice(i + 1, close).split(',').map((p) =>
          p.split('').map((ch) => (SPECIAL.includes(ch) ? '\\' + ch : ch)).join('').replace(/\\\*/g, '[^/]*'),
        );
        re += '(?:' + alts.join('|') + ')';
        i = close + 1; continue;
      }
    }
    if (SPECIAL.includes(c)) { re += '\\' + c; i += 1; continue; }
    re += c; i += 1;
  }
  const out = new RegExp('^' + re + '$');
  RE_CACHE.set(glob, out);
  return out;
}

export const matchGlob = (path, glob) => globToRegex(glob).test(posix(path));
export const matchAny = (path, globs) => (globs || []).some((g) => matchGlob(path, g));

export function loadJson(file, fallback = null) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; }
}

/** `git diff --name-status` -> [{ status, path, from }]. Handles renames. */
export function parseNameStatus(out) {
  const rows = [];
  for (const raw of String(out).split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim()) continue;
    const cols = line.split('\t');
    const status = cols[0][0];
    if ((status === 'R' || status === 'C') && cols.length >= 3) {
      rows.push({ status, path: posix(cols[2]), from: posix(cols[1]) });
    } else if (cols.length >= 2) {
      rows.push({ status, path: posix(cols[1]), from: null });
    }
  }
  return rows;
}

const emptyFile = () => ({ added: [], ranges: [], addedCount: 0, removedCount: 0 });

function pushRange(file, line) {
  const last = file.ranges[file.ranges.length - 1];
  if (last && last[1] === line - 1) last[1] = line;
  else file.ranges.push([line, line]);
}

/**
 * Unified diff -> per-file added lines (with their NEW line numbers) and the
 * changed-line ranges the grounding gate checks findings against.
 */
export function parsePatch(patch) {
  const files = new Map();
  let cur = null;
  let newLine = 0;
  for (const raw of String(patch).split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line.startsWith('diff --git ')) { cur = null; continue; }
    if (line.startsWith('+++ ')) {
      const p = line.slice(4).trim();
      if (p === '/dev/null') { cur = null; continue; }
      const path = posix(p.startsWith('b/') ? p.slice(2) : p);
      if (!files.has(path)) files.set(path, emptyFile());
      cur = files.get(path);
      continue;
    }
    if (line.startsWith('--- ')) continue;
    if (line.startsWith('@@')) {
      const m = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) newLine = Number(m[1]);
      continue;
    }
    if (!cur) continue;
    if (line.startsWith('+')) {
      cur.added.push({ line: newLine, text: line.slice(1) });
      pushRange(cur, newLine);
      newLine += 1;
      cur.addedCount += 1;
    } else if (line.startsWith('-')) {
      cur.removedCount += 1;
    } else if (line.startsWith(' ') || line === '') {
      newLine += 1;
    }
  }
  return files;
}

/** Synthesize an untracked file as one big added hunk. */
export function addUntracked(files, entries) {
  for (const u of entries) {
    const f = emptyFile();
    if (!u.skipped) {
      const lines = u.text.split('\n');
      if (lines.length && lines[lines.length - 1] === '') lines.pop();
      lines.forEach((text, idx) => {
        f.added.push({ line: idx + 1, text });
        pushRange(f, idx + 1);
      });
      f.addedCount = lines.length;
    }
    files.set(posix(u.path), f);
  }
  return files;
}

export const intersects = (ranges, start, end) =>
  (ranges || []).some(([s, e]) => start <= e && end >= s);

/* ------------------------------------------------------------------ routing */

/**
 * Map the change set onto the repo's skills. Returns the per-bundle slices, the
 * ranked skill list, what the cap dropped, and the files that matched no route
 * at all (the "unreviewed surface").
 */
export function route(routing, paths) {
  const perSkill = new Map();
  const perBundle = new Map();
  const matched = new Set();

  const note = (skill, bundle, file) => {
    if (routing.excluded && routing.excluded[skill]) return;
    if (!perSkill.has(skill)) perSkill.set(skill, new Set());
    perSkill.get(skill).add(file);
    if (!perBundle.has(bundle)) perBundle.set(bundle, { files: new Set(), skills: new Set() });
    perBundle.get(bundle).files.add(file);
    perBundle.get(bundle).skills.add(skill);
  };

  for (const file of paths) {
    for (const r of routing.routes || []) {
      if (!matchAny(file, r.globs)) continue;
      matched.add(file);
      for (const skill of r.skills) note(skill, r.bundle, file);
    }
  }

  const ranked = [...perSkill.entries()]
    .map(([skill, files]) => ({ skill, count: files.size }))
    .sort((a, b) => b.count - a.count || a.skill.localeCompare(b.skill));

  const cap = routing.maxSkillsPerRun ?? 6;
  const kept = new Set(ranked.slice(0, cap).map((r) => r.skill));
  const dropped = ranked.slice(cap).map((r) => r.skill);

  const bundles = [...perBundle.entries()]
    .map(([bundle, v]) => ({
      bundle,
      files: [...v.files].sort(),
      skills: [...v.skills].filter((s) => kept.has(s)).sort(),
    }))
    .filter((b) => b.skills.length > 0)
    .sort((a, b) => a.bundle.localeCompare(b.bundle));

  const unrouted = paths.filter((p) => !matched.has(p)).sort();
  return { bundles, ranked, kept: [...kept].sort(), dropped, unrouted };
}

/** Content triggers add a skill when a regex matches an ADDED line. */
export function applyContentTriggers(routing, files, routed) {
  const extra = [];
  for (const t of routing.contentTriggers || []) {
    const re = new RegExp(t.pattern, t.flags || '');
    const hits = [];
    for (const [path, f] of files) {
      if (t.pathGlobs && !matchAny(path, t.pathGlobs)) continue;
      if (f.added.some((a) => re.test(a.text))) hits.push(path);
    }
    if (!hits.length) continue;
    if (routed.kept.includes(t.skill)) continue;
    extra.push({ skill: t.skill, bundle: t.bundle || 'crosscut', files: hits.sort() });
  }
  return extra;
}

/* ----------------------------------------------------------------- findings */

export const SEVERITIES = ['CRITICAL', 'WARNING', 'SUGGESTION'];
const WEIGHT = { CRITICAL: 35, WARNING: 12, SUGGESTION: 3 };

/** Same weights as `scoreFromFindings` in reviewer-core/src/review/reduce.ts. */
export function scoreFromFindings(findings) {
  const penalty = findings.reduce((sum, f) => sum + (WEIGHT[f.severity] ?? 0), 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}

/** A pure function of the findings — never taken from a model. */
export function verdictFromFindings(findings) {
  if (findings.some((f) => f.severity === 'CRITICAL')) return 'request_changes';
  return findings.length ? 'comment' : 'approve';
}

/**
 * Lowercase, collapse whitespace, drop digits — so an accepted finding survives
 * the code moving a few lines.
 */
export const normalizeTitle = (t) =>
  String(t).toLowerCase().replace(/\d+/g, '').replace(/\s+/g, ' ').trim();

/**
 * Acceptance key. The trailing counter on a MECH id (`MECH-TSC-server-3`) is an
 * ordinal, not identity, so it is stripped; a DET id's number IS the rule, so it
 * stays.
 */
export const findingKey = (f) => {
  const id = String(f.id);
  const rule = id.startsWith('MECH-') ? id.replace(/-\d+$/, '') : id;
  return rule + '|' + posix(f.file) + '|' + normalizeTitle(f.title);
};

export function finding({
  id, severity, category = 'bug', title, file, startLine = 1, endLine = null,
  rationale, suggestion = null, confidence = 1, kind = 'finding', phase = 1,
}) {
  return {
    id,
    severity,
    category,
    title,
    file: posix(file),
    start_line: startLine,
    end_line: endLine ?? startLine,
    rationale,
    suggestion,
    confidence,
    kind,
    phase,
  };
}

export function dedupe(findings) {
  const rank = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };
  const seen = new Map();
  for (const f of findings) {
    const key = posix(f.file) + '|' + f.start_line + '|' + normalizeTitle(f.title);
    const prev = seen.get(key);
    if (!prev || rank[f.severity] < rank[prev.severity]) seen.set(key, f);
  }
  return [...seen.values()];
}
