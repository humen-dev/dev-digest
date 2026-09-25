/**
 * pr-self-review — report rendering and the PR-body draft.
 *
 * Vocabulary is the repo's own (docs/agent-prompts/README.md): severity is
 * CRITICAL | WARNING | SUGGESTION, verdict is request_changes | approve |
 * comment, and the score is always RECOMPUTED from the findings.
 */
import { codePackages } from './checks.mjs';
import { scoreFromFindings, verdictFromFindings } from './lib.mjs';

const ORDER = ['CRITICAL', 'WARNING', 'SUGGESTION'];
const by = (findings, sev) => findings.filter((f) => f.severity === sev);

const phaseLine = (name, state, detail, ms) => {
  const time = ms == null ? '' : '   (' + (ms / 1000).toFixed(1) + 's)';
  return '  ' + name.padEnd(30) + state.padEnd(8) + (detail || '') + time;
};

export function render(run) {
  const f = run.findings;
  const score = scoreFromFindings(f);
  const verdict = verdictFromFindings(f);
  const crit = by(f, 'CRITICAL').length;
  const L = [];

  L.push('# PR Self-Review — ' + run.branch + ' -> ' + (run.baseRef || 'main'));
  L.push(
    'Base ' + run.base.slice(0, 7) + ' · ' + run.paths.length + ' files · +' + run.churn.added +
      ' -' + run.churn.removed + ' · signature ' + run.signatureShort,
  );
  if (run.baseAhead > 0) L.push('origin/main is ' + run.baseAhead + ' commit(s) ahead — consider `git fetch origin main`');

  if (run.docsOnly) {
    L.push('Docs-only change set — the code phases do not apply.');
  } else if (run.routing.bundles.length) {
    for (const b of run.routing.bundles) {
      L.push('Routed: ' + b.bundle.padEnd(9) + '-> ' + b.skills.join(', ') + '  (' + b.files.length + ' files)');
    }
    if (run.routing.dropped.length) L.push('Not run (cap ' + run.cap + '): ' + run.routing.dropped.join(', '));
  } else {
    L.push('Routed: nothing — no changed file matched a skill route.');
  }
  if (run.routing.unrouted && run.routing.unrouted.length) {
    const shown = run.routing.unrouted.slice(0, 8).join(', ');
    const more = run.routing.unrouted.length > 8 ? ' (+' + (run.routing.unrouted.length - 8) + ' more)' : '';
    L.push('Unreviewed surface (no route): ' + shown + more);
  }
  L.push('');

  for (const p of run.phases) L.push(phaseLine(p.name, p.state, p.detail, p.ms));
  L.push('');

  if (f.length === 0) {
    L.push('## Findings');
    L.push('None.');
  } else {
    L.push('## Findings');
    let n = 0;
    for (const sev of ORDER) {
      const group = by(f, sev);
      if (!group.length) continue;
      L.push('');
      L.push('### ' + sev + ' (' + group.length + ')');
      for (const x of group) {
        n += 1;
        L.push(n + '. [' + x.id + '] ' + x.file + ':' + x.start_line + ' — ' + x.title);
        for (const line of String(x.rationale).split('\n')) L.push('   ' + line);
        if (x.suggestion) {
          const s = String(x.suggestion).split('\n');
          L.push('   Fix: ' + s[0]);
          for (const line of s.slice(1)) L.push('        ' + line);
        }
      }
    }
  }

  L.push('');
  L.push('Verdict: ' + verdict + '   Score: ' + score + '/100');
  const meta = [];
  if (run.grounding) meta.push('Dropped by grounding: ' + run.grounding.dropped);
  if (run.suppressed && run.suppressed.length) {
    meta.push('Suppressed by accepted.json: ' + run.suppressed.length + ' (' + run.suppressed.map((s) => s.id).join(', ') + ')');
  }
  if (run.cacheReused && run.cacheReused.length) meta.push('Reused from cache: ' + run.cacheReused.join(', '));
  if (meta.length) L.push(meta.join(' · '));
  L.push('');

  if (crit > 0) {
    L.push('BLOCKED — `gh pr create` is blocked until every CRITICAL is resolved.');
    const skipped = run.phases.filter((p) => p.state === 'SKIPPED' && /fail fast/.test(p.detail || ''));
    if (skipped.length) L.push('Phases ' + skipped.map((p) => p.name.split(' ')[1]).join(', ') + ' did not run; expect further findings after you fix the above.');
    L.push('Re-run /pr-self-review.');
    L.push('If a CRITICAL is a genuine false positive:');
    L.push('  node .claude/skills/pr-self-review/scripts/pr-self-review.mjs accept "<key>" --reason "..."');
  } else if (run.incomplete) {
    L.push('NOT SEALED — the run is incomplete (' + run.incomplete + '), so the gate stays closed.');
  } else if (run.sealed) {
    L.push('GREEN — sealed for signature ' + run.signatureShort + '. `gh pr create` is unblocked until HEAD or the working tree changes.');
    L.push('PR body drafted -> .claude/.pr-self-review/pr-body.md');
    L.push('  gh pr create --body-file .claude/.pr-self-review/pr-body.md');
  } else {
    L.push('No CRITICAL findings. Phase 3 has not run yet — see the skill workflow.');
  }
  return { text: L.join('\n'), score, verdict, criticals: crit };
}

/**
 * Acceptance keys, so retiring a false positive is one copy-paste. Every Phase-1/2
 * finding gets one — a recurring WARNING is worth silencing too — while Phase-3
 * findings deliberately get none: a wrong LLM finding is fixed, not frozen.
 */
export function keysBlock(findings, keyOf) {
  const acceptable = findings.filter((f) => f.phase !== 3);
  if (!acceptable.length) return '';
  return ['', 'Acceptance keys (Phase 1/2 only):', ...acceptable.map((f) => '  ' + f.severity.padEnd(11) + keyOf(f))].join('\n');
}

export function prBody(run) {
  const areas = run.routing.bundles.map((b) => b.bundle);
  const byPkg = new Map();
  for (const p of run.paths) {
    const seg = p.split('/')[0];
    byPkg.set(seg, (byPkg.get(seg) || 0) + 1);
  }
  const L = [];
  L.push('## Summary');
  L.push('');
  L.push('<!-- Replace this line: what changed and why. -->');
  L.push('');
  L.push('## What changed');
  L.push('');
  for (const [pkg, count] of [...byPkg.entries()].sort((a, b) => b[1] - a[1])) {
    L.push('- `' + pkg + '` — ' + count + ' file(s)');
  }
  L.push('');
  L.push('## Checks');
  L.push('');
  if (run.docsOnly) {
    L.push('- Docs-only change set: code phases skipped by the pre-PR gate.');
  } else if (run.checkResults && run.checkResults.length) {
    for (const r of run.checkResults) L.push('- ' + (r.ok ? 'PASS' : 'FAIL') + ' `' + r.pkg + '` ' + r.label);
  } else {
    L.push('- No package checks were triggered by these paths.');
  }
  L.push('');
  L.push('## Test plan');
  L.push('');
  // Driven by codePackages(), the same signal planChecks() uses — a package
  // touched only in Markdown gets no entry, so this never contradicts "Checks".
  const touched = codePackages(run.paths);
  const plan = {
    server: '`cd server && pnpm typecheck && pnpm exec vitest run --exclude "**/*.it.test.ts"`',
    client: '`cd client && pnpm typecheck && pnpm test`',
    'reviewer-core': '`cd reviewer-core && npm run typecheck && npm test`',
    e2e: '`./scripts/e2e.sh` — the gate typechecks the flows but never runs them',
  };
  for (const pkg of touched) L.push('- [ ] ' + plan[pkg]);
  if (!touched.length) L.push('- [ ] No package code changed — nothing to run.');
  L.push('');
  L.push('## Self-review');
  L.push('');
  L.push(
    '`/pr-self-review` — verdict **' + run.verdict + '**, score ' + run.score + '/100' +
      (areas.length ? ', skills applied: ' + run.routing.bundles.flatMap((b) => b.skills).filter((v, i, a) => a.indexOf(v) === i).sort().join(', ') : '') + '.',
  );
  const nonBlocking = run.findings.filter((f) => f.severity !== 'CRITICAL');
  if (nonBlocking.length) {
    L.push('');
    L.push('Non-blocking findings left open:');
    for (const f of nonBlocking) L.push('- ' + f.severity + ' [' + f.id + '] `' + f.file + ':' + f.start_line + '` — ' + f.title);
  }
  L.push('');
  return L.join('\n');
}
