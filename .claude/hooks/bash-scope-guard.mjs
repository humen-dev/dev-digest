#!/usr/bin/env node
/**
 * PreToolUse hook (Bash) for read-mostly subagents — usage:
 *   node .claude/hooks/bash-scope-guard.mjs <profile>   # implementer | test-writer | architecture-reviewer | security-reviewer | plan-verifier
 *
 * An allow-list, not a block-list: the command is split into segments
 * (`&&` `||` `;` `|` newline) and EVERY segment must match one of the profile's
 * patterns. Before that, anything that could smuggle a write or a second
 * command past the tokenizer (redirection, substitution, background `&`, `tee`,
 * `$` expansion) is rejected outright — being over-strict here is cheap, the
 * agent just gets a deny reason telling it what it may run instead.
 */
import { deny, allow, readPayload, segments, tokenize } from './lib/guard-io.mjs';

const GUARD = 'bash-scope-guard';

const CD_DIR = /^(?:\.\/)?(?:server|client|reviewer-core|e2e|mcp)\/?$/;
const GIT_READ = new Set(['status', 'diff', 'log', 'show', 'merge-base', 'rev-parse', 'ls-files']);

/** `cd <package>` — the only way to change directory. */
const isCd = (t) => t.length === 2 && t[0] === 'cd' && CD_DIR.test(t[1]);

/** Read-only git without any output-to-file flag. */
const isGitRead = (t) =>
  t[0] === 'git' &&
  GIT_READ.has(t[1]) &&
  !t.slice(2).some((a) => a === '-o' || a === '--output' || a.startsWith('--output='));

/**
 * Vitest arguments: paths plus a few harmless flags. Anything that writes
 * (`-u`, `--update`, `--coverage`, `--outputFile`) or never exits (`--watch`)
 * falls outside the list and is denied.
 */
const VITEST_FLAGS = new Set(['--', '--run', '--exclude', '-t', '--testNamePattern', '--passWithNoTests', '--silent', '--reporter=dot']);
const vitestArgsOk = (args) =>
  args.every(
    (a) =>
      !a.startsWith('-') ||
      VITEST_FLAGS.has(a) ||
      a.startsWith('--exclude=') ||
      a.startsWith('--testNamePattern='),
  );

const eq = (t, ...words) => t.length === words.length && words.every((w, i) => t[i] === w);
const startsWith = (t, ...words) => t.length >= words.length && words.every((w, i) => t[i] === w);

/** Test and typecheck runners used by test-writer and plan-verifier. */
function isTestRun(t) {
  if (eq(t, 'pnpm', 'typecheck') || eq(t, 'npm', 'run', 'typecheck')) return true;
  if (startsWith(t, 'pnpm', 'test')) return vitestArgsOk(t.slice(2));
  if (startsWith(t, 'npm', 'test')) return vitestArgsOk(t.slice(2));
  if (startsWith(t, 'pnpm', 'exec', 'vitest', 'run') || startsWith(t, 'pnpm', 'exec', 'vitest', 'related')) return vitestArgsOk(t.slice(4));
  if (startsWith(t, 'npx', 'vitest', 'run') || startsWith(t, 'npx', 'vitest', 'related')) return vitestArgsOk(t.slice(3));
  return false;
}

/**
 * `node scripts/agent-check.mjs <package> [--full|--it|--no-tests] [files…]` — the
 * token-lean typecheck + related-tests wrapper. `../scripts/…` covers a shell
 * that is still inside a package after `cd <package>`.
 */
const AGENT_CHECK = /^(?:\.\.\/)?scripts\/agent-check\.mjs$/;
const AGENT_CHECK_PKG = new Set(['server', 'client', 'reviewer-core', 'e2e', 'mcp']);
const AGENT_CHECK_FLAGS = new Set(['--full', '--it', '--no-tests']);
const isAgentCheck = (t) =>
  t.length >= 3 &&
  t[0] === 'node' &&
  AGENT_CHECK.test(t[1]) &&
  AGENT_CHECK_PKG.has(t[2]) &&
  t.slice(3).every((a) => (a.startsWith('-') ? AGENT_CHECK_FLAGS.has(a) : !a.includes('..')));

/** `pnpm db:generate --name <snake_name>` — drizzle-kit writes the unit's own new migration. */
const isDbGenerate = (t) => t.length === 4 && t[0] === 'pnpm' && t[1] === 'db:generate' && t[2] === '--name' && /^[a-z0-9_]+$/.test(t[3]);

/** `pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known [--output-type X]`. */
const DEPCRUISE = ['pnpm', 'exec', 'depcruise', 'src', '--config', '.dependency-cruiser.cjs', '--ignore-known'];
const DEPCRUISE_TYPES = new Set(['err', 'err-long', 'json', 'text']);
function isDepcruise(t) {
  if (!startsWith(t, ...DEPCRUISE)) return false;
  const rest = t.slice(DEPCRUISE.length);
  if (rest.length === 0) return true;
  if (rest.length === 1 && rest[0].startsWith('--output-type=')) return DEPCRUISE_TYPES.has(rest[0].slice(14));
  return rest.length === 2 && rest[0] === '--output-type' && DEPCRUISE_TYPES.has(rest[1]);
}

/** `node --test .claude/hooks/<name>.test.mjs …` — the guards' own suites. */
const HOOK_TEST = /^\.claude\/hooks\/[A-Za-z0-9._*-]+\.test\.mjs$/;
const isHookTest = (t) => t.length >= 3 && t[0] === 'node' && t[1] === '--test' && t.slice(2).every((a) => HOOK_TEST.test(a));

const COMMON = 'cd <package>, read-only git (status|diff|log|show|merge-base|rev-parse|ls-files)';
const TESTS = 'pnpm test|typecheck, pnpm exec vitest run|related [paths], npm test, npm run typecheck, npx vitest run|related [paths]';
const DEPCRUISE_TEXT = 'pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known [--output-type err|err-long|json|text]';
const AGENT_CHECK_TEXT = 'node scripts/agent-check.mjs <package> [--full|--it|--no-tests] [files…] (preferred: short output)';

const PROFILES = {
  implementer: {
    matchers: [isAgentCheck, isTestRun, isDepcruise, isDbGenerate],
    allowed: `${COMMON}, ${AGENT_CHECK_TEXT}, ${TESTS}, ${DEPCRUISE_TEXT}, pnpm db:generate --name <snake_name>`,
  },
  'test-writer': { matchers: [isAgentCheck, isTestRun], allowed: `${COMMON}, ${AGENT_CHECK_TEXT}, ${TESTS}` },
  'architecture-reviewer': { matchers: [isDepcruise], allowed: `${COMMON}, ${DEPCRUISE_TEXT}` },
  'security-reviewer': { matchers: [], allowed: COMMON },
  'plan-verifier': {
    matchers: [isAgentCheck, isTestRun, isDepcruise, isHookTest],
    allowed: `${COMMON}, ${AGENT_CHECK_TEXT}, ${TESTS}, ${DEPCRUISE_TEXT}, node --test .claude/hooks/*.test.mjs`,
  },
};

/** Constructs rejected anywhere in the raw command, quoted or not. */
const FORBIDDEN = [
  [/[<>]/, 'redirection (< or >)'],
  [/`/, 'backtick substitution'],
  [/\$/, '$ expansion or substitution'],
  [/(^|[^&])&(?!&)/, 'background &'],
  [/(^|[\s|;&])tee(\s|$)/, 'tee'],
];

const profileName = process.argv[2];
const payload = readPayload(GUARD);
const profile = Object.hasOwn(PROFILES, profileName ?? '') ? PROFILES[profileName] : null;
if (!profile) deny(GUARD, `unknown profile "${profileName ?? ''}" — refusing the command (expected: ${Object.keys(PROFILES).join(' | ')}).`);

const command = payload.tool_input?.command;
if (typeof command !== 'string' || !command.trim()) deny(GUARD, `${profileName} may not run an empty command — refusing.`);

const instead = `allowed commands: ${profile.allowed} — chained only with && ; | ||, no redirection, env assignments or substitution.`;

for (const [re, what] of FORBIDDEN) {
  if (re.test(command)) deny(GUARD, `${profileName} may not use ${what}; ${instead}`);
}

for (const seg of segments(command)) {
  const tokens = tokenize(seg);
  if (tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0])) {
    deny(GUARD, `${profileName} may not prefix commands with env assignments ("${seg}"); ${instead}`);
  }
  const ok = isCd(tokens) || isGitRead(tokens) || profile.matchers.some((m) => m(tokens));
  if (!ok) deny(GUARD, `${profileName} may not run "${seg}"; ${instead}`);
}

allow();
