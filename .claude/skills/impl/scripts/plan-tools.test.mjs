/**
 * Tests for plan-tools.mjs — run: node --test .claude/skills/impl/scripts/plan-tools.test.mjs
 * Parsing is checked on a synthetic plan and on real plans in docs/plans/.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO, parsePlan, ownedPaths, unitAgent, unitWave, owners, expandBraces } from './plan-tools.mjs';

const TOOL = path.join(path.dirname(fileURLToPath(import.meta.url)), 'plan-tools.mjs');
const real = (slug) => parsePlan(readFileSync(path.join(REPO, 'docs/plans', `${slug}.md`), 'utf8'));
const cli = (...args) => spawnSync(process.execPath, [TOOL, ...args], { cwd: REPO, encoding: 'utf8' });

const SYNTHETIC = `# X — development plan

| Field | Value |
|---|---|
| Status | approved |
| Execution mode | multi-agent (parallel waves) |

## 3. Contracts
\`\`\`ts
export type A = string;
\`\`\`

## 4. Work units

### U0 — Contracts (orchestrator)
| Field | Value |
|---|---|
| Kind | backend |
| Wave | 0 |
| Owns (create/modify) | \`server/src/vendor/shared/contracts/a.ts\` |

### U1 — server: service
| Field | Value |
|---|---|
| Kind | backend |
| Wave | 1 |
| Owns (create/modify) | \`server/src/modules/a/{service,routes}.ts\`, \`test/a.test.ts\` |

### U2 — client: card
| Field | Value |
|---|---|
| Kind | ui |
| Wave | 1 |
| Owns (create/modify) | \`client/src/app/a/_components/ACard/**\` |

### U3 — mcp tool labelled backend
| Field | Value |
|---|---|
| Kind | backend (tooling) |
| Wave | 2 |
| Owns (create/modify) | \`mcp/src/tools/a.ts\` |

### U4 — server: service again (single-agent re-own)
| Field | Value |
|---|---|
| Kind | backend |
| Wave | 2 |
| Owns (create/modify) | \`server/src/modules/a/service.ts\` |

## 5. Waves
`;

test('expandBraces expands every group', () => {
  assert.deepEqual(expandBraces('a/{b,c}/{d,e}.ts'), ['a/b/d.ts', 'a/b/e.ts', 'a/c/d.ts', 'a/c/e.ts']);
  assert.deepEqual(expandBraces('a/b.ts'), ['a/b.ts']);
});

test('synthetic plan: header, units, waves, agents', () => {
  const plan = parsePlan(SYNTHETIC);
  assert.equal(plan.header.Status, 'approved');
  assert.deepEqual(plan.units.map((u) => u.id), ['U0', 'U1', 'U2', 'U3', 'U4']);
  assert.deepEqual(plan.units.map(unitWave), [0, 1, 1, 2, 2]);
  assert.deepEqual(plan.units.map(unitAgent), ['orchestrator', 'implementer-backend', 'implementer-ui', 'implementer', 'implementer-backend']);
  // unit blocks stop at the next section, not at the end of the file
  assert.ok(!plan.lines.slice(plan.units[4].start, plan.units[4].end + 1).join('\n').includes('## 5.'));
});

test('ownedPaths: braces expanded, package prefix inherited', () => {
  const [, u1] = parsePlan(SYNTHETIC).units;
  assert.deepEqual(ownedPaths(u1), ['server/src/modules/a/service.ts', 'server/src/modules/a/routes.ts', 'server/test/a.test.ts']);
});

test('owners: exact, glob, unowned, latest wave wins on re-own', () => {
  const plan = parsePlan(SYNTHETIC);
  const res = owners(plan, [
    'server/src/modules/a/routes.ts',
    'client/src/app/a/_components/ACard/ACard.tsx',
    'server/src/other.ts',
    'server/src/modules/a/service.ts',
  ]);
  assert.deepEqual(res.map((r) => [r.status, r.owner, r.agent]), [
    ['owned', 'U1', 'implementer-backend'],
    ['owned', 'U2', 'implementer-ui'],
    ['unowned', null, 'orchestrator'],
    ['owned', 'U4', 'implementer-backend'],
  ]);
  assert.equal(res[3].candidates.length, 2);
});

test('real plan intent-layer: units, agents and package-relative owns', () => {
  const plan = real('intent-layer');
  const byId = Object.fromEntries(plan.units.map((u) => [u.id, u]));
  assert.equal(unitAgent(byId.U0), 'orchestrator');
  assert.equal(unitAgent(byId.U1), 'implementer');
  assert.equal(unitAgent(byId.U3), 'implementer-backend');
  assert.equal(unitAgent(byId.U4), 'implementer-ui');
  assert.ok(ownedPaths(byId.U2).includes('reviewer-core/test/scope-filter.test.ts'));
  assert.ok(ownedPaths(byId.U2).includes('reviewer-core/specs/grounding-contract.md'));
  assert.equal(owners(plan, ['reviewer-core/src/intent/classify.ts'])[0].owner, 'U1');
});

test('real plan devdigest-mcp: "backend"-labelled mcp units go to implementer, tooling to orchestrator', () => {
  const plan = real('devdigest-mcp');
  const byId = Object.fromEntries(plan.units.map((u) => [u.id, u]));
  assert.equal(unitAgent(byId.U1), 'implementer');
  assert.equal(unitAgent(byId.U8), 'orchestrator');
});

test('CLI: waves/unit print text, errors exit 2 with a reason', () => {
  const waves = cli('waves', 'intent-layer');
  assert.equal(waves.status, 0);
  assert.match(waves.stdout, /Wave 1:\n\s+U1\s+implementer\s/);
  const unit = cli('unit', 'docs/plans/intent-layer.md', 'U2');
  assert.equal(unit.status, 0);
  assert.match(unit.stdout, /^<!-- docs\/plans\/intent-layer\.md · U2 · lines \d+-\d+ · agent: implementer -->/);
  assert.match(unit.stdout, /§3 Contracts: .* lines \d+-\d+/);
  assert.match(unit.stdout, /### U2 — /);
  assert.doesNotMatch(unit.stdout, /### U3 — /);
  for (const args of [['unit', 'intent-layer', 'U99'], ['waves', 'conventions-extractor'], ['waves', 'no-such-plan'], ['state', 'get', 'Bad_Slug'], ['nope']]) {
    const r = cli(...args);
    assert.equal(r.status, 2, args.join(' '));
    assert.match(r.stderr, /^plan-tools: /);
  }
});
