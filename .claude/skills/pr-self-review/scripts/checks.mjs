/**
 * pr-self-review — Phase 2: the repo's own CI commands, for the packages the
 * diff actually touches.
 *
 * Every command is the one `.github/workflows/*.yml` runs, spawned with
 * `shell: false` and an argv array: the integration-test exclude glob is a
 * PowerShell landmine when passed as a single quoted string. A failure maps to a CRITICAL finding at the
 * exact file:line when the tool reports one.
 */
import { spawnSync } from 'node:child_process';
import { join, relative, resolve } from 'node:path';
import { finding, matchGlob, posix } from './lib.mjs';

const WIN = process.platform === 'win32';
/**
 * On Windows the package managers are `.cmd` shims, and since the fix for
 * CVE-2024-27980 Node refuses to spawn those without a shell (`EINVAL`). So the
 * shell is enabled on win32 only, and the name is left bare for it to resolve.
 * This is safe for the glob arguments because cmd.exe does not expand `*`;
 * POSIX keeps `shell: false`, where nothing expands either.
 */
const bin = (name) => name;
const TSC_CAP = 20;

/** Source files only: a docs-only touch inside a package must not trigger a build. */
const codeIn = (paths, pkg) =>
  paths.filter((p) => posix(p).startsWith(pkg + '/') && !/\.(md|txt)$/i.test(p));

/**
 * Build the check plan from the change set.
 * `reviewer-core` and the vendored shared contracts fan out to their consumers:
 * cross-package tsconfig path aliases consume `reviewer-core` AS SOURCE, so an
 * engine change breaks `server` / `client` typecheck without touching them.
 */
export function planChecks(paths) {
  const plan = [];
  const seen = new Set();
  const push = (step) => {
    const key = step.pkg + '|' + step.label;
    if (seen.has(key)) return;
    seen.add(key);
    plan.push(step);
  };

  const client = codeIn(paths, 'client').length > 0;
  const server = codeIn(paths, 'server').length > 0;
  const core = codeIn(paths, 'reviewer-core').length > 0;
  const e2e = codeIn(paths, 'e2e').length > 0;
  const shared = paths.some((p) => matchGlob(p, '**/src/vendor/shared/**'));
  const serverSrc = paths.some((p) => matchGlob(p, 'server/src/**'));

  const fanout = core || shared;

  if (client || fanout) {
    push({ pkg: 'client', label: 'typecheck', cmd: bin('pnpm'), args: ['typecheck'], timeout: 180_000, parse: 'tsc' });
  }
  if (client) {
    push({ pkg: 'client', label: 'test', cmd: bin('pnpm'), args: ['test'], timeout: 300_000, parse: 'vitest' });
  }
  if (server || fanout) {
    push({ pkg: 'server', label: 'typecheck', cmd: bin('pnpm'), args: ['typecheck'], timeout: 180_000, parse: 'tsc' });
  }
  if (server) {
    push({
      pkg: 'server',
      label: 'unit tests',
      cmd: bin('pnpm'),
      // Mirrors .github/workflows/server-unit.yml — `pnpm test` would also run the
      // testcontainers `.it.test.ts` suites, which need Docker.
      args: ['exec', 'vitest', 'run', '--exclude', '**/*.it.test.ts'],
      timeout: 300_000,
      parse: 'vitest',
    });
  }
  if (serverSrc) {
    push({
      pkg: 'server',
      label: 'architecture',
      cmd: bin('pnpm'),
      args: ['exec', 'depcruise', 'src', '--config', '.dependency-cruiser.cjs', '--ignore-known'],
      timeout: 120_000,
      parse: 'depcruise',
    });
  }
  if (core || shared) {
    push({ pkg: 'reviewer-core', label: 'typecheck', cmd: bin('npm'), args: ['run', 'typecheck'], timeout: 120_000, parse: 'tsc' });
    push({ pkg: 'reviewer-core', label: 'test', cmd: bin('npm'), args: ['test'], timeout: 180_000, parse: 'vitest' });
  }
  if (e2e || shared) {
    // `npm test` here is `tsx run.ts` and needs a live stack — DET-014 covers it.
    push({ pkg: 'e2e', label: 'typecheck', cmd: bin('npm'), args: ['run', 'typecheck'], timeout: 120_000, parse: 'tsc' });
  }
  return plan;
}

function runStep(root, step) {
  const started = Date.now();
  const r = spawnSync(step.cmd, step.args, {
    cwd: join(root, step.pkg),
    encoding: 'utf8',
    shell: WIN,
    timeout: step.timeout,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, CI: '1', FORCE_COLOR: '0' },
  });
  return {
    ...step,
    ms: Date.now() - started,
    status: r.status,
    timedOut: r.error && r.error.code === 'ETIMEDOUT',
    spawnError: r.error && r.error.code !== 'ETIMEDOUT' ? String(r.error.message) : null,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
  };
}

/** `path/to/file.ts(12,5): error TS2322: Type 'number' is not assignable...` */
function parseTsc(root, step, text) {
  const out = [];
  let n = 0;
  for (const raw of text.split('\n')) {
    const m = raw.replace(/\r$/, '').match(/^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/);
    if (!m) continue;
    n += 1;
    if (n > TSC_CAP) continue;
    const abs = resolve(join(root, step.pkg), m[1]);
    out.push(
      finding({
        id: 'MECH-TSC-' + step.pkg + '-' + n,
        severity: 'CRITICAL',
        category: 'bug',
        title: m[4] + ': ' + m[5],
        file: posix(relative(root, abs)),
        startLine: Number(m[2]),
        rationale: 'TypeScript reports `' + m[4] + '` here. `tsc --noEmit` is this repo\'s lint gate, so a type error is a hard CI failure.',
        suggestion: 'Fix the type error, then re-run `cd ' + step.pkg + ' && ' + (step.cmd.startsWith('pnpm') ? 'pnpm' : 'npm run') + ' typecheck`.',
        phase: 2,
      }),
    );
  }
  if (n > TSC_CAP) {
    out.push(
      finding({
        id: 'MECH-TSC-' + step.pkg + '-rollup',
        severity: 'CRITICAL',
        category: 'bug',
        title: n - TSC_CAP + ' further TypeScript errors not listed',
        file: step.pkg + '/tsconfig.json',
        rationale: 'The typecheck reported ' + n + ' errors; only the first ' + TSC_CAP + ' are listed individually.',
        suggestion: 'Run `cd ' + step.pkg + ' && pnpm typecheck` for the full list.',
        phase: 2,
      }),
    );
  }
  return out;
}

/** vitest prints `FAIL  path/to/file.test.ts > suite > case`. */
function parseVitest(root, step, text) {
  const failed = new Map();
  for (const raw of text.split('\n')) {
    const m = raw.replace(/\r$/, '').match(/^\s*(?:×|FAIL)\s+([^\s>]+\.test\.[tj]sx?)(?:\s*>\s*(.*))?$/);
    if (!m) continue;
    const file = m[1];
    if (!failed.has(file)) failed.set(file, new Set());
    if (m[2]) failed.get(file).add(m[2].trim());
  }
  const out = [];
  let n = 0;
  for (const [file, cases] of failed) {
    n += 1;
    const abs = resolve(join(root, step.pkg), file);
    const names = [...cases].slice(0, 5);
    out.push(
      finding({
        id: 'MECH-TEST-' + step.pkg + '-' + n,
        severity: 'CRITICAL',
        category: 'test',
        title: 'Failing test file: ' + posix(file),
        file: posix(relative(root, abs)),
        startLine: 1,
        rationale:
          'This suite fails under `' + step.pkg + ' ' + step.label + '`' +
          (names.length ? ': ' + names.join('; ') : '') + '.',
        suggestion: 'Reproduce with `cd ' + step.pkg + ' && pnpm exec vitest run ' + posix(file) + '`.',
        phase: 2,
      }),
    );
  }
  return out;
}

/** depcruise error lines: `  error no-cross-module-internals: src/a.ts -> src/b.ts` */
function parseDepcruise(root, step, text) {
  const out = [];
  let n = 0;
  for (const raw of text.split('\n')) {
    const m = raw.replace(/\r$/, '').match(/^\s*error\s+([\w-]+):\s+(\S+)\s+(?:->|→)\s+(\S+)/);
    if (!m) continue;
    n += 1;
    out.push(
      finding({
        id: 'MECH-ARCH-' + n,
        severity: 'CRITICAL',
        category: 'bug',
        title: 'Layer rule `' + m[1] + '` violated',
        file: posix(join('server', m[2])),
        startLine: 1,
        rationale: '`' + m[2] + '` imports `' + m[3] + '`, which the onion rule `' + m[1] + '` forbids. Dependencies point inward only.',
        suggestion: 'Reverse the dependency with a port. See `.claude/skills/onion-architecture/references/enforcement.md`.',
        phase: 2,
      }),
    );
  }
  return out;
}

const PARSERS = { tsc: parseTsc, vitest: parseVitest, depcruise: parseDepcruise };

export function runChecks(root, plan, onStep) {
  const results = [];
  const findings = [];
  for (const step of plan) {
    const r = runStep(root, step);
    results.push({ pkg: r.pkg, label: r.label, ms: r.ms, status: r.status, ok: r.status === 0 && !r.timedOut && !r.spawnError });
    if (onStep) onStep(r);
    if (r.status === 0 && !r.timedOut && !r.spawnError) continue;

    if (r.timedOut || r.spawnError) {
      findings.push(
        finding({
          id: 'MECH-' + step.label.toUpperCase().replace(/\s+/g, '-') + '-' + step.pkg + (r.timedOut ? '-TIMEOUT' : '-SPAWN'),
          severity: 'CRITICAL',
          category: 'bug',
          title: r.timedOut ? step.pkg + ' ' + step.label + ' timed out' : step.pkg + ' ' + step.label + ' could not start',
          file: step.pkg + '/package.json',
          rationale: r.timedOut
            ? 'The check exceeded its ' + Math.round(step.timeout / 1000) + 's budget. A check that does not finish is never a pass.'
            : 'The command could not be spawned: ' + r.spawnError,
          suggestion: 'Run `cd ' + step.pkg + ' && ' + step.cmd + ' ' + step.args.join(' ') + '` directly to see what is happening.',
          phase: 2,
        }),
      );
      continue;
    }

    const text = r.stdout + '\n' + r.stderr;
    const parsed = (PARSERS[step.parse] || (() => []))(root, step, text);
    if (parsed.length) {
      findings.push(...parsed);
      continue;
    }
    const tail = text.split('\n').filter((l) => l.trim()).slice(-40).join('\n');
    findings.push(
      finding({
        id: 'MECH-' + step.parse.toUpperCase() + '-' + step.pkg + '-raw',
        severity: 'CRITICAL',
        category: 'bug',
        title: step.pkg + ' ' + step.label + ' failed (exit ' + r.status + ')',
        file: step.pkg + '/package.json',
        rationale: 'The check failed but its output did not parse into individual findings. Last lines:\n\n```\n' + tail + '\n```',
        suggestion: 'Run `cd ' + step.pkg + ' && ' + step.cmd + ' ' + step.args.join(' ') + '`.',
        phase: 2,
      }),
    );
  }
  return { results, findings };
}
