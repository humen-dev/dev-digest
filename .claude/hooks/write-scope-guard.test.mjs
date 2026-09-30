/**
 * Tests for write-scope-guard.mjs — run: node --test .claude/hooks/write-scope-guard.test.mjs
 * Each case spawns the real hook with a PreToolUse payload on stdin.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUARD = path.join(HERE, 'write-scope-guard.mjs');
const REPO = path.resolve(HERE, '..', '..');

function run(profile, input, env = { CLAUDE_PROJECT_DIR: REPO }) {
  const args = profile === undefined ? [GUARD] : [GUARD, profile];
  const { CLAUDE_PROJECT_DIR: _drop, ...base } = process.env;
  const res = spawnSync(process.execPath, args, { input, encoding: 'utf8', cwd: REPO, env: { ...base, ...env } });
  assert.equal(res.status, 0, `hook exited ${res.status}: ${res.stderr}`);
  return res.stdout;
}

const payload = (filePath, extra = {}) => JSON.stringify({ tool_name: 'Write', tool_input: { file_path: filePath }, cwd: REPO, ...extra });

function assertAllowed(profile, filePath) {
  const out = run(profile, payload(filePath));
  assert.equal(out, '', `expected ${profile} to be allowed to write ${filePath}, got: ${out}`);
}

function assertDenied(profile, input, raw = false) {
  const out = run(profile, raw ? input : payload(input));
  assert.notEqual(out, '', `expected ${profile} to be denied for ${input}`);
  const decision = JSON.parse(out).hookSpecificOutput;
  assert.equal(decision.hookEventName, 'PreToolUse');
  assert.equal(decision.permissionDecision, 'deny');
  assert.match(decision.permissionDecisionReason, /^write-scope-guard: /);
  return decision.permissionDecisionReason;
}

test('fail-closed: unknown / missing profile, empty stdin, invalid JSON, no file_path', () => {
  assertDenied('nope', 'client/src/a.test.ts');
  assertDenied(undefined, 'client/src/a.test.ts');
  assertDenied('test-writer', '', true);
  assertDenied('test-writer', '{not json', true);
  assertDenied('test-writer', JSON.stringify({ tool_name: 'Write', tool_input: {}, cwd: REPO }), true);
});

test('test-writer: test files allowed', () => {
  for (const p of [
    'client/src/app/x/_components/A/A.test.tsx',
    'server/test/foo.it.test.ts',
    'server/test/helpers/pg.ts',
    'server/src/modules/foo/service.test.ts',
    'client/src/test/render.tsx',
    'reviewer-core/test/engine.ts',
    'e2e/specs/07-foo.flow.json',
    'mcp/src/tools/list-agents.test.ts',
    'mcp/test/fake-api.ts',
  ]) assertAllowed('test-writer', p);
});

test('test-writer: source, setup, vendor, config and outside paths denied', () => {
  for (const p of [
    'client/src/app/x/page.tsx',
    'client/src/test/setup.ts',
    'server/src/vendor/shared/x.ts',
    'server/src/vendor/shared/x.test.ts',
    'server/src/adapters/mocks.ts',
    'client/vitest.config.ts',
    'server/src/app.ts',
    'e2e/specs/7-foo.flow.json',
    'mcp/src/tools/list-agents.ts',
    '../outside.ts',
  ]) {
    const reason = assertDenied('test-writer', p);
    assert.match(reason, /test-writer may not write/);
    assert.match(reason, /BLOCKED/, 'reason must say what to do instead');
  }
});

test('test-writer: backslash and absolute paths are normalized', () => {
  assertAllowed('test-writer', 'client\\src\\app\\x\\_components\\A\\A.test.tsx');
  assertAllowed('test-writer', path.join(REPO, 'server', 'test', 'foo.test.ts'));
  assertDenied('test-writer', path.join(REPO, 'server', 'src', 'app.ts'));
  assertDenied('test-writer', path.resolve(REPO, '..', 'elsewhere', 'a.test.ts'));
});

test('relative path resolves against payload.cwd; root falls back to payload.cwd', () => {
  const input = payload('src/x.test.tsx', { cwd: path.join(REPO, 'client') });
  assert.equal(run('test-writer', input), '');
  const noEnv = run('test-writer', payload('client/src/x.test.tsx'), {});
  assert.equal(noEnv, '');
});

test('doc-writer: docs allowed', () => {
  for (const p of [
    'server/docs/conventions.md',
    'server/docs/adr/0001-x.md',
    'client/README.md',
    'README.md',
    'docs/adr/0001-x.md',
    'mcp/README.md',
    'mcp/docs/tools.md',
  ]) assertAllowed('doc-writer', p);
});

test('doc-writer: specs, agent maps, plans and code denied', () => {
  for (const p of [
    'server/specs/conventions.md',
    'server/AGENTS.md',
    'AGENTS.md',
    'client/CLAUDE.md',
    'server/INSIGHTS.md',
    'TESTING.md',
    'docs/plans/x.md',
    'docs/agent-prompts/x.md',
    'docs/skill-foo/x.md',
    'server/docs/x.ts',
    'server/src/app.ts',
    'mcp/AGENTS.md',
    'mcp/INSIGHTS.md',
    '../README.md',
  ]) {
    const reason = assertDenied('doc-writer', p);
    assert.match(reason, /doc-writer may not write/);
  }
});
