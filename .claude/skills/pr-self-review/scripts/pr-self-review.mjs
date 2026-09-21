#!/usr/bin/env node
/**
 * pr-self-review — the pre-PR gate CLI.
 *
 * Phases, cheapest first, fail-fast:
 *   0 collect   change set, changed-line index, routing, signature, fast paths
 *   1 det       repo invariants (DET-001…018), filtered through accepted.json
 *   2 checks    the repo's CI commands for the packages in the diff
 *   3 review    dispatched by the AGENT, not here — this CLI reduces its output
 *   4 seal      green => write state.json (unblocks the hook) + pr-body.md
 *
 * Subcommands:
 *   run [--full] [--skip-mechanical] [--only=det|mech] [--base=<ref>] [--no-cache]
 *   routing --dry     print the routing decision only, run nothing
 *   report --phase3 <file>   merge agent findings, ground, score, seal if green
 *   status            what the gate currently thinks
 *   seal --force --reason "..."
 *   accept "<key>" --reason "..."
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  currentSignature, git, normalizeEOL, readState, repoRoot, sha256, short,
  stateDir, trackedPatch, untrackedEntries,
} from './signature.mjs';
import {
  addUntracked, applyContentTriggers, dedupe, findingKey, intersects, loadJson,
  matchAny, parseNameStatus, parsePatch, posix, route, scoreFromFindings, verdictFromFindings,
} from './lib.mjs';
import { listSkillDirs, runDeterministic } from './rules.mjs';
import { planChecks, runChecks } from './checks.mjs';
import { keysBlock, prBody, render } from './report.mjs';

const ROOT = repoRoot();
const SKILL = join(ROOT, '.claude', 'skills', 'pr-self-review');
const OUT = stateDir(ROOT);

const flag = (argv, name) => argv.includes('--' + name);
const opt = (argv, name) => {
  const pre = '--' + name + '=';
  const hit = argv.find((a) => a.startsWith(pre));
  if (hit) return hit.slice(pre.length);
  const i = argv.indexOf('--' + name);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
};

const write = (name, data) => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, name), typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n', 'utf8');
};
const read = (name) => loadJson(join(OUT, name), null);

/* ------------------------------------------------------------------ phase 0 */

function collect(argv) {
  const baseOverride = opt(argv, 'base');
  const sig = currentSignature(ROOT, baseOverride);
  const { base } = sig;

  const statuses = parseNameStatus(git(['diff', '--no-color', '--name-status', base, '--'], ROOT).stdout);
  const untracked = untrackedEntries(ROOT);
  const files = addUntracked(parsePatch(normalizeEOL(trackedPatch(ROOT, base))), untracked);

  // A deleted file has no post-image, so it is in `statuses` but not in `files`.
  const paths = [...new Set([...statuses.map((s) => s.path), ...untracked.map((u) => posix(u.path))])].sort();

  const routing = loadJson(join(SKILL, 'routing.json'), { routes: [], gate: {} });
  const accepted = loadJson(join(SKILL, 'accepted.json'), { accepted: [] });
  const skillDirs = listSkillDirs(ROOT);

  // Skills are code lenses: a Markdown or docs file has none, so it is neither
  // routed nor reported as unreviewed surface.
  const docsGlobs = (routing.gate || {}).docsOnlyGlobs || [];
  const ignoreUnrouted = (routing.gate || {}).unroutedIgnoreGlobs || [];
  const codePaths = paths.filter((p) => !matchAny(p, docsGlobs));

  const routed = route(routing, codePaths);
  routed.unrouted = routed.unrouted.filter((p) => !matchAny(p, ignoreUnrouted));
  const extra = applyContentTriggers(routing, files, routed);
  for (const e of extra) {
    let bundle = routed.bundles.find((b) => b.bundle === e.bundle);
    if (!bundle) {
      bundle = { bundle: e.bundle, files: [], skills: [] };
      routed.bundles.push(bundle);
    }
    if (!bundle.skills.includes(e.skill)) bundle.skills.push(e.skill);
    for (const f of e.files) if (!bundle.files.includes(f)) bundle.files.push(f);
    if (!routed.kept.includes(e.skill)) routed.kept.push(e.skill);
  }
  routed.bundles.sort((a, b) => a.bundle.localeCompare(b.bundle));

  let added = 0;
  let removed = 0;
  for (const [, f] of files) { added += f.addedCount; removed += f.removedCount; }

  const docsOnly = paths.length > 0 && codePaths.length === 0;

  const fileHashes = {};
  for (const [path, f] of files) fileHashes[path] = sha256(f.added.map((a) => a.line + ':' + a.text).join('\n'));

  const configHash = sha256(
    [
      JSON.stringify(routing),
      JSON.stringify(accepted),
      ...routed.kept.map((s) => {
        try { return readFileSync(join(ROOT, '.claude', 'skills', s, 'SKILL.md'), 'utf8'); } catch { return s; }
      }),
    ].join('\u0000'),
  );

  return {
    ...sig,
    signatureShort: short(sig.signature),
    startedAt: new Date().toISOString(),
    paths,
    statuses,
    churn: { added, removed },
    routing: routed,
    cap: routing.maxSkillsPerRun ?? 6,
    docsOnly,
    fileHashes,
    configHash,
    gate: routing.gate || {},
    _files: files,
    _routingConfig: routing,
    _accepted: accepted,
    _skillDirs: skillDirs,
  };
}

/* ---------------------------------------------------------------- accepted */

function splitAccepted(findings, accepted) {
  const keys = new Set((accepted.accepted || []).map((a) => a.key));
  const kept = [];
  const suppressed = [];
  for (const f of findings) {
    // Phase-3 findings are never acceptable: fix the skill or the code instead.
    if (f.phase !== 3 && keys.has(findingKey(f))) suppressed.push(f);
    else kept.push(f);
  }
  return { kept, suppressed };
}

/* ------------------------------------------------------------------- grounding */

/** Drop any Phase-3 finding whose lines do not intersect a real diff hunk —
 *  the same gate as reviewer-core/src/grounding.ts. Phases 1–2 are exempt. */
function ground(findings, files) {
  let dropped = 0;
  const kept = findings.filter((f) => {
    if (f.phase !== 3) return true;
    const file = files.get(posix(f.file));
    if (file && intersects(file.ranges, f.start_line, f.end_line)) return true;
    dropped += 1;
    return false;
  });
  return { kept, dropped };
}

/* --------------------------------------------------------------------- seal */

function seal(run, { forced = false, reason = null } = {}) {
  const state = {
    version: 1,
    signature: run.signature,
    headSha: run.headSha,
    base: run.base,
    branch: run.branch,
    verdict: run.verdict,
    score: run.score,
    criticals: run.findings.filter((f) => f.severity === 'CRITICAL').length,
    warnings: run.findings.filter((f) => f.severity === 'WARNING').length,
    incomplete: Boolean(run.incomplete),
    forced,
    reason,
    sealedAt: new Date().toISOString(),
  };
  write('state.json', state);
  return state;
}

function finish(run, { sealIfGreen = true } = {}) {
  run.score = scoreFromFindings(run.findings);
  run.verdict = verdictFromFindings(run.findings);
  const criticals = run.findings.filter((f) => f.severity === 'CRITICAL').length;
  const green = criticals === 0 && !run.incomplete;

  if (green && sealIfGreen) {
    run.sealed = true;
    seal(run);
    write('pr-body.md', prBody(run));
  } else {
    // Re-reviewing a change set invalidates any earlier seal for it. Without
    // this, a failed or incomplete re-run silently rides on the previous pass.
    const prior = readState(ROOT);
    if (prior && prior.signature === run.signature && !prior.forced) {
      try { rmSync(join(OUT, 'state.json')); } catch { /* nothing to clear */ }
    }
  }

  const out = render(run);
  const persisted = { ...run };
  delete persisted._files;
  delete persisted._routingConfig;
  delete persisted._accepted;
  delete persisted._skillDirs;
  write('run.json', persisted);
  write('last-report.json', { verdict: out.verdict, score: out.score, criticals: out.criticals, findings: run.findings, signature: run.signature });
  write('last-report.md', out.text);

  process.stdout.write(out.text + keysBlock(run.findings, findingKey) + '\n');
  return criticals === 0 ? 0 : 1;
}

/* ---------------------------------------------------------------- commands */

function cmdRouting(argv) {
  const run = collect(argv);
  const L = [];
  L.push('Routing for ' + run.branch + ' (' + run.paths.length + ' files, base ' + run.base.slice(0, 7) + ')');
  L.push(run.docsOnly ? 'Docs-only change set: phases 2 and 3 would be skipped.' : '');
  for (const b of run.routing.bundles) {
    L.push('');
    L.push('bundle ' + b.bundle + '  skills: ' + b.skills.join(', '));
    for (const f of b.files.slice(0, 20)) L.push('    ' + f);
    if (b.files.length > 20) L.push('    ... +' + (b.files.length - 20) + ' more');
  }
  L.push('');
  L.push('ranked: ' + run.routing.ranked.map((r) => r.skill + '(' + r.count + ')').join(', '));
  if (run.routing.dropped.length) L.push('dropped by cap ' + run.cap + ': ' + run.routing.dropped.join(', '));
  L.push('unrouted (' + run.routing.unrouted.length + '): ' + (run.routing.unrouted.join(', ') || 'none'));
  process.stdout.write(L.filter((x) => x !== '').join('\n') + '\n');
  return 0;
}

function cmdRun(argv) {
  const t0 = Date.now();
  const run = collect(argv);
  const only = opt(argv, 'only');
  const full = flag(argv, 'full');
  const skipMech = flag(argv, 'skip-mechanical');
  const noCache = flag(argv, 'no-cache');
  run.phases = [];

  if (run.paths.length === 0) {
    run.findings = [];
    run.phases.push({ name: 'Phase 1 · Repo invariants', state: 'SKIPPED', detail: '(no changes vs base)' });
    run.phases.push({ name: 'Phase 2 · Mechanical checks', state: 'SKIPPED', detail: '(no changes)' });
    run.phases.push({ name: 'Phase 3 · Skill review', state: 'SKIPPED', detail: '(no changes)' });
    return finish(run);
  }

  /* Phase 1 */
  const t1 = Date.now();
  const raw = runDeterministic({
    root: ROOT,
    files: run._files,
    statuses: run.statuses,
    paths: run.paths,
    routing: run._routingConfig,
    base: run.base,
    baseAhead: run.baseAhead,
    skillDirs: run._skillDirs,
  });
  const split = splitAccepted(dedupe(raw), run._accepted);
  run.findings = split.kept;
  run.suppressed = split.suppressed;
  const det = { crit: run.findings.filter((f) => f.severity === 'CRITICAL').length, warn: run.findings.filter((f) => f.severity === 'WARNING').length };
  run.phases.push({
    name: 'Phase 1 · Repo invariants',
    state: det.crit ? 'FAIL' : 'PASS',
    detail: det.crit || det.warn ? '— ' + det.crit + ' CRITICAL, ' + det.warn + ' WARNING' : '',
    ms: Date.now() - t1,
  });

  // `--only` is a debugging mode: it must never seal, or a partial run would
  // open the gate on checks that were never executed.
  if (only) run.incomplete = 'partial run (--only=' + only + ')';

  const failFast = det.crit > 0 && !full;
  if (failFast || only === 'det') {
    const why = failFast ? '(fail fast)' : '(--only=det)';
    run.phases.push({ name: 'Phase 2 · Mechanical checks', state: 'SKIPPED', detail: why });
    run.phases.push({ name: 'Phase 3 · Skill review', state: 'SKIPPED', detail: why });
    return finish(run);
  }

  /* Phase 2 */
  if (run.docsOnly) {
    run.phases.push({ name: 'Phase 2 · Mechanical checks', state: 'SKIPPED', detail: '(docs-only)' });
    run.phases.push({ name: 'Phase 3 · Skill review', state: 'SKIPPED', detail: '(docs-only)' });
    run.totalMs = Date.now() - t0;
    return finish(run);
  }
  if (skipMech) {
    run.phases.push({ name: 'Phase 2 · Mechanical checks', state: 'SKIPPED', detail: '(--skip-mechanical)' });
  } else {
    const plan = planChecks(run.paths);
    const prev = noCache ? null : read('run.json');
    const reusable =
      prev && prev.configHash === run.configHash && prev.base === run.base && prev.checkResults
        ? new Set(
            prev.checkResults
              .filter((r) => r.ok)
              .filter((r) => {
                const changedInPkg = run.paths.filter((p) => p.startsWith(r.pkg + '/'));
                return changedInPkg.every((p) => prev.fileHashes && prev.fileHashes[p] === run.fileHashes[p]);
              })
              .map((r) => r.pkg + '|' + r.label),
          )
        : new Set();

    const toRun = plan.filter((s) => !reusable.has(s.pkg + '|' + s.label));
    run.cacheReused = plan.filter((s) => reusable.has(s.pkg + '|' + s.label)).map((s) => s.pkg + ' ' + s.label);

    const t2 = Date.now();
    process.stderr.write(
      toRun.length
        ? 'running ' + toRun.length + ' check(s): ' + toRun.map((s) => s.pkg + ' ' + s.label).join(', ') + '\n'
        : 'no checks to run (all reused from cache)\n',
    );
    const { results, findings } = runChecks(ROOT, toRun, (r) =>
      process.stderr.write('  ' + (r.status === 0 ? 'ok  ' : 'FAIL') + ' ' + r.pkg + ' ' + r.label + '  ' + (r.ms / 1000).toFixed(1) + 's\n'),
    );
    run.checkResults = [
      ...results,
      ...plan.filter((s) => reusable.has(s.pkg + '|' + s.label)).map((s) => ({ pkg: s.pkg, label: s.label, ok: true, cached: true, ms: 0 })),
    ];
    const mech = splitAccepted(findings, run._accepted);
    run.findings.push(...mech.kept);
    run.suppressed.push(...mech.suppressed);
    const mCrit = mech.kept.filter((f) => f.severity === 'CRITICAL').length;
    run.phases.push({
      name: 'Phase 2 · Mechanical checks',
      state: mCrit ? 'FAIL' : 'PASS',
      detail: mCrit ? '— ' + mCrit + ' CRITICAL' : '— ' + plan.length + ' check(s)',
      ms: Date.now() - t2,
    });
    if (mCrit > 0 && !full) {
      run.phases.push({ name: 'Phase 3 · Skill review', state: 'SKIPPED', detail: '(fail fast)' });
      run.totalMs = Date.now() - t0;
      return finish(run);
    }
  }

  if (only === 'mech') {
    run.phases.push({ name: 'Phase 3 · Skill review', state: 'SKIPPED', detail: '(--only=mech)' });
    run.totalMs = Date.now() - t0;
    return finish(run);
  }

  /* Phase 3 is the agent's job. Persist the run and say so. */
  run.phases.push({ name: 'Phase 3 · Skill review', state: 'PENDING', detail: '(dispatch the bundles, then `report --phase3`)' });
  run.totalMs = Date.now() - t0;
  const code = finish(run, { sealIfGreen: false });
  process.stdout.write(
    '\nPHASE3_REQUIRED — dispatch one subagent per bundle above, then:\n' +
      '  node .claude/skills/pr-self-review/scripts/pr-self-review.mjs report --phase3 <file.json>\n',
  );
  return code;
}

function cmdReport(argv) {
  const prev = read('run.json');
  if (!prev) {
    process.stderr.write('No run.json — run `pr-self-review run` first.\n');
    return 2;
  }
  const fresh = currentSignature(ROOT);
  if (fresh.signature !== prev.signature) {
    process.stderr.write('The change set moved since the last run (signature ' + short(prev.signature) + ' -> ' + short(fresh.signature) + '). Re-run `run`.\n');
    return 2;
  }
  const file = opt(argv, 'phase3');
  const payload = file ? loadJson(file, null) : { bundles: [] };
  if (file && !payload) {
    process.stderr.write('Could not read ' + file + '\n');
    return 2;
  }

  const run = { ...prev };
  run._files = addUntracked(parsePatch(normalizeEOL(trackedPatch(ROOT, run.base))), untrackedEntries(ROOT));
  run._accepted = loadJson(join(SKILL, 'accepted.json'), { accepted: [] });

  const incoming = [];
  const unparsed = [];
  for (const b of payload.bundles || []) {
    if (b.error || !Array.isArray(b.findings)) { unparsed.push(b.bundle || 'unknown'); continue; }
    for (const f of b.findings) incoming.push({ ...f, phase: 3, kind: f.kind || 'finding' });
  }

  const merged = dedupe([...run.findings, ...incoming]);
  const g = ground(merged, run._files);
  const split = splitAccepted(g.kept, run._accepted);

  run.findings = split.kept;
  run.suppressed = [...(run.suppressed || []), ...split.suppressed];
  run.grounding = { dropped: g.dropped };
  run.incomplete = unparsed.length ? 'bundle(s) unparseable: ' + unparsed.join(', ') : false;
  run.phases = run.phases.map((p) =>
    p.name.startsWith('Phase 3')
      ? { ...p, state: unparsed.length ? 'PARTIAL' : 'PASS', detail: '— ' + incoming.length + ' finding(s) from ' + (payload.bundles || []).length + ' bundle(s)' }
      : p,
  );
  delete run._files;
  delete run._accepted;
  return finish(run);
}

function cmdStatus() {
  const state = read('state.json');
  const fresh = currentSignature(ROOT);
  const ttl = 4 * 60 * 60 * 1000;
  const green =
    state && state.version === 1 && state.signature === fresh.signature &&
    state.verdict !== 'request_changes' && state.incomplete !== true &&
    Date.now() - Date.parse(state.sealedAt) < ttl;
  process.stdout.write(
    'branch      ' + fresh.branch + '\n' +
      'signature   ' + short(fresh.signature) + '\n' +
      'sealed      ' + (state ? short(state.signature) + ' at ' + state.sealedAt : '(never)') + '\n' +
      'gate        ' + (green ? 'OPEN — gh pr create is allowed' : 'CLOSED — run /pr-self-review') + '\n',
  );
  return green ? 0 : 1;
}

function cmdSeal(argv) {
  if (!flag(argv, 'force')) {
    process.stderr.write('`seal` only exists as a deliberate override: pass --force --reason "...".\n');
    return 2;
  }
  const reason = opt(argv, 'reason');
  if (!reason) {
    process.stderr.write('--reason is mandatory for a forced seal.\n');
    return 2;
  }
  const prev = read('run.json') || {};
  const sig = currentSignature(ROOT);
  const state = seal(
    { ...sig, verdict: 'comment', score: prev.score ?? 0, findings: prev.findings || [], incomplete: false },
    { forced: true, reason },
  );
  write('last-report.md', (read('last-report.md') || '') + '\n\nFORCED SEAL ' + state.sealedAt + ' — ' + reason + '\n');
  process.stdout.write('Forced seal written for signature ' + short(sig.signature) + ': ' + reason + '\n');
  return 0;
}

function cmdAccept(argv) {
  const key = argv.find((a) => !a.startsWith('--') && a.includes('|'));
  const reason = opt(argv, 'reason');
  if (!key || !reason) {
    process.stderr.write('Usage: accept "<rule>|<file>|<normalized title>" --reason "..."\n');
    return 2;
  }
  if (/^[A-Z]+-\d+\|/.test(key) === false && key.startsWith('MECH-') === false) {
    process.stderr.write('Key must start with a rule id (DET-nnn or MECH-...).\n');
    return 2;
  }
  const file = join(SKILL, 'accepted.json');
  const doc = loadJson(file, { version: 1, accepted: [] });
  if ((doc.accepted || []).some((a) => a.key === key)) {
    process.stdout.write('Already accepted: ' + key + '\n');
    return 0;
  }
  doc.accepted = [
    ...(doc.accepted || []),
    { key, reason, addedBy: process.env.USERNAME || process.env.USER || 'unknown', addedAt: new Date().toISOString().slice(0, 10) },
  ];
  writeFileSync(file, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  process.stdout.write('Accepted ' + key + '\nCommit accepted.json so the whole team sees the suppression.\n');
  return 0;
}

/* --------------------------------------------------------------------- main */

const argv = process.argv.slice(2);
const cmd = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'run';
const table = { run: cmdRun, routing: cmdRouting, report: cmdReport, status: cmdStatus, seal: cmdSeal, accept: cmdAccept };
if (!table[cmd]) {
  process.stderr.write('Unknown command `' + cmd + '`. One of: ' + Object.keys(table).join(', ') + '\n');
  process.exit(2);
}
process.exit(table[cmd](argv));
