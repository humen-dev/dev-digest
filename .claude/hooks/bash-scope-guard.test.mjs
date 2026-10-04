/**
 * Tests for bash-scope-guard.mjs — run: node --test .claude/hooks/bash-scope-guard.test.mjs
 * Each case spawns the real hook with a PreToolUse payload on stdin.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUARD = path.join(HERE, 'bash-scope-guard.mjs');
const REPO = path.resolve(HERE, '..', '..');

function run(profile, input) {
  const args = profile === undefined ? [GUARD] : [GUARD, profile];
  const res = spawnSync(process.execPath, args, {
    input,
    encoding: 'utf8',
    cwd: REPO,
    env: { ...process.env, CLAUDE_PROJECT_DIR: REPO },
  });
  assert.equal(res.status, 0, `hook exited ${res.status}: ${res.stderr}`);
  return res.stdout;
}

const payload = (command) => JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd: REPO });

function assertAllowed(profile, command) {
  const out = run(profile, payload(command));
  assert.equal(out, '', `expected ${profile} to be allowed: ${command}\ngot: ${out}`);
}

function assertDenied(profile, command, raw = false) {
  const out = run(profile, raw ? command : payload(command));
  assert.notEqual(out, '', `expected ${profile} to be denied: ${command}`);
  const decision = JSON.parse(out).hookSpecificOutput;
  assert.equal(decision.hookEventName, 'PreToolUse');
  assert.equal(decision.permissionDecision, 'deny');
  assert.match(decision.permissionDecisionReason, /^bash-scope-guard: /);
  return decision.permissionDecisionReason;
}

const ALL = ['implementer', 'test-writer', 'architecture-reviewer', 'security-reviewer', 'plan-verifier'];
const DEPCRUISE = 'cd server && pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known';

test('fail-closed: unknown / missing profile, empty stdin, invalid JSON, no command', () => {
  assertDenied('nope', 'git status');
  assertDenied(undefined, 'git status');
  assertDenied('plan-verifier', '', true);
  assertDenied('plan-verifier', '{not json', true);
  assertDenied('plan-verifier', JSON.stringify({ tool_name: 'Bash', tool_input: {}, cwd: REPO }), true);
});

test('every profile: cd <package> and read-only git allowed', () => {
  for (const p of ALL) {
    for (const cmd of [
      'git status',
      'git diff main...HEAD',
      'git log --oneline -5',
      'git show HEAD:server/package.json',
      'git merge-base main HEAD',
      'cd ./client/ && git ls-files',
      'cd mcp && git status',
      'git diff --stat main...HEAD | git log -1',
    ]) assertAllowed(p, cmd);
  }
});

test('every profile: writes, installs, substitution and escapes denied', () => {
  for (const p of ALL) {
    for (const cmd of [
      'pnpm install',
      'npm install',
      'git add .',
      'git commit -m x',
      'git -c core.pager=sh log',
      'git diff --output=x',
      'git diff --output x',
      'git log -o x',
      'git diff main...HEAD > out.txt',
      'git log < in.txt',
      'rm -rf x',
      'echo $(id)',
      'echo ${HOME}',
      'git log `id`',
      'echo x | tee y',
      'git status & rm -rf x',
      'FOO=1 git status',
      'cd ..',
      'cd /tmp',
      'cd server && rm -rf src',
    ]) {
      const reason = assertDenied(p, cmd);
      assert.match(reason, new RegExp(`${p} may not`));
      assert.match(reason, /allowed commands:/, 'reason must say what to do instead');
    }
  }
});

test('architecture-reviewer: depcruise allowed, tests denied', () => {
  assertAllowed('architecture-reviewer', DEPCRUISE);
  assertAllowed('architecture-reviewer', `${DEPCRUISE} --output-type err`);
  assertAllowed('architecture-reviewer', `${DEPCRUISE} --output-type=json`);
  assertDenied('architecture-reviewer', `${DEPCRUISE} --output-type dot`);
  assertDenied('architecture-reviewer', `${DEPCRUISE} --output-to x`);
  assertDenied('architecture-reviewer', 'cd server && pnpm test');
  assertDenied('architecture-reviewer', 'node --test .claude/hooks/write-scope-guard.test.mjs');
});

test('security-reviewer: read-only git only — no depcruise, tests, audits or hook suites', () => {
  assertAllowed('security-reviewer', 'git diff main...HEAD -- server/src');
  for (const cmd of [
    `${DEPCRUISE} --output-type err`,
    'cd server && pnpm test',
    'cd server && pnpm typecheck',
    'cd server && pnpm audit',
    'node --test .claude/hooks/write-scope-guard.test.mjs',
    'curl https://example.com',
  ]) assertDenied('security-reviewer', cmd);
});

test('test-writer: test runners allowed, snapshot/coverage/watch and depcruise denied', () => {
  for (const cmd of [
    'cd client && pnpm exec vitest run src/app/x',
    'cd server && pnpm test',
    'cd server && pnpm typecheck',
    'cd reviewer-core && npm test',
    'cd reviewer-core && npm run typecheck',
    'cd e2e && npx vitest run specs/x.test.ts',
    'cd mcp && npm test',
    'cd mcp && npm run typecheck',
    'pnpm exec vitest run src --exclude src/slow',
    'pnpm exec vitest run --exclude=src/slow -t "renders row"',
  ]) assertAllowed('test-writer', cmd);
  for (const cmd of [
    'pnpm exec vitest run -u',
    'pnpm exec vitest run --update',
    'pnpm exec vitest run --coverage',
    'pnpm exec vitest run --watch',
    'pnpm exec vitest run --outputFile=x.json',
    'pnpm exec vitest',
    'pnpm test -u',
    'npx vitest run -u',
    'npm install',
    `${DEPCRUISE} --output-type err`,
    'node --test .claude/hooks/write-scope-guard.test.mjs',
  ]) assertDenied('test-writer', cmd);
});

test('plan-verifier: tests, depcruise and hook suites allowed', () => {
  assertAllowed('plan-verifier', 'cd client && pnpm exec vitest run src/app/x');
  assertAllowed('plan-verifier', `${DEPCRUISE} --output-type err`);
  assertAllowed('plan-verifier', 'node --test .claude/hooks/write-scope-guard.test.mjs');
  assertAllowed('plan-verifier', 'node --test .claude/hooks/write-scope-guard.test.mjs .claude/hooks/bash-scope-guard.test.mjs');
  assertAllowed('plan-verifier', 'node scripts/agent-check.mjs server --full');
  assertDenied('plan-verifier', 'node --test server/test/x.test.mjs');
  assertDenied('plan-verifier', 'node .claude/hooks/pr-gate.mjs');
  assertDenied('plan-verifier', 'pnpm exec vitest run -u');
});

const AGENT_CHECK = 'node scripts/agent-check.mjs';

test('implementer: agent-check, tests, depcruise and db:generate allowed; git writes, installs and servers denied', () => {
  for (const cmd of [
    `${AGENT_CHECK} server server/src/modules/x/service.ts server/test/x.test.ts`,
    `${AGENT_CHECK} client --full`,
    `${AGENT_CHECK} server --it src/modules/x/repository.ts`,
    `${AGENT_CHECK} e2e --no-tests`,
    'cd server && node ../scripts/agent-check.mjs server src/modules/x/routes.ts',
    'cd client && pnpm typecheck',
    'cd client && pnpm exec vitest related src/app/x/X.tsx --run --reporter=dot',
    'cd server && pnpm exec vitest run --exclude "**/*.it.test.ts"',
    `${DEPCRUISE} --output-type err`,
    'cd server && pnpm db:generate --name intent_layer',
  ]) assertAllowed('implementer', cmd);
  for (const cmd of [
    `${AGENT_CHECK} nope src/x.ts`,
    `${AGENT_CHECK} server --watch`,
    `${AGENT_CHECK} server ../../etc/passwd`,
    'node scripts/other.mjs server',
    'cd server && pnpm db:migrate',
    'cd server && pnpm db:generate --name "x; rm -rf ."',
    'cd server && pnpm db:generate',
    'cd server && pnpm dev',
    'git stash',
    'git checkout -- server/src/x.ts',
    'gh pr create',
    'docker compose down -v',
    'npm ci',
    'powershell -c "git commit"',
  ]) assertDenied('implementer', cmd);
});

test('test-writer: agent-check and reporter=dot allowed, db:generate denied', () => {
  assertAllowed('test-writer', `${AGENT_CHECK} client client/src/app/x/X.test.tsx`);
  assertAllowed('test-writer', 'cd client && pnpm exec vitest run src/app/x --reporter=dot');
  assertDenied('test-writer', 'cd server && pnpm db:generate --name x');
  assertDenied('architecture-reviewer', `${AGENT_CHECK} server --full`);
  assertDenied('security-reviewer', `${AGENT_CHECK} server --full`);
});
