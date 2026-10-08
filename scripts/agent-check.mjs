#!/usr/bin/env node
/**
 * Token-lean typecheck + test runner for agents (implementer, test-writer).
 *
 *   node scripts/agent-check.mjs <package> [--full] [--it] [--no-tests] [files…]
 *
 *   <package>   server | client | reviewer-core | e2e | mcp
 *   files…      the files you own (repo-relative, package-relative or absolute).
 *               Typecheck errors in them are printed in full; errors elsewhere are
 *               only counted and listed by file ("other files"). Tests run with
 *               `vitest related <files>` — only the tests that import them.
 *   --full      run the whole unit suite instead of `related` (do this once, at the end)
 *   --it        server only: include `*.it.test.ts` (needs Docker)
 *   --no-tests  typecheck only
 *
 * Output is a short summary plus the first failures, trimmed — never a raw
 * reporter dump. Exit 0 when everything is green, 1 otherwise, 2 on bad usage.
 * Calls tsc / vitest straight from the package's node_modules: no installs,
 * no shell, nothing written outside the OS temp dir.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = ['server', 'client', 'reviewer-core', 'e2e', 'mcp'];
const MAX_OWN_TS_ERRORS = 15;
const MAX_OTHER_FILES = 5;
const MAX_FAILED_TESTS = 5;
const MAX_FAILURE_LINES = 8;

function usage(msg) {
  console.error(`agent-check: ${msg}\nusage: node scripts/agent-check.mjs <${PACKAGES.join('|')}> [--full] [--it] [--no-tests] [files…]`);
  process.exit(2);
}

const args = process.argv.slice(2);
const pkg = args.shift();
if (!PACKAGES.includes(pkg ?? '')) usage(`unknown package "${pkg ?? ''}"`);
const flags = new Set(args.filter((a) => a.startsWith('--')));
for (const f of flags) if (!['--full', '--it', '--no-tests'].includes(f)) usage(`unknown flag ${f}`);

const pkgDir = path.join(REPO, pkg);
const toPkgRel = (p) => {
  const abs = path.isAbsolute(p) ? p : existsSync(path.resolve(REPO, p)) ? path.resolve(REPO, p) : path.resolve(pkgDir, p);
  return path.relative(pkgDir, abs).replaceAll('\\', '/');
};
const files = args.filter((a) => !a.startsWith('--')).map(toPkgRel);
const outside = files.filter((f) => f.startsWith('../'));
if (outside.length) usage(`files outside ${pkg}/: ${outside.join(', ')}`);

const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const clip = (s, n = 200) => (s.length > n ? `${s.slice(0, n)}…` : s);
const env = { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', CI: '1' };

function run(bin, binArgs) {
  const res = spawnSync(process.execPath, [bin, ...binArgs], { cwd: pkgDir, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { status: res.status, out: stripAnsi(`${res.stdout ?? ''}${res.stderr ?? ''}`) };
}

let green = true;

// ── typecheck ────────────────────────────────────────────────────────────────
const tsc = path.join(pkgDir, 'node_modules/typescript/bin/tsc');
if (!existsSync(tsc)) usage(`${pkg}/node_modules/typescript is missing — dependencies are not installed`);
const ts = run(tsc, ['--noEmit', '--pretty', 'false', '-p', 'tsconfig.json']);
const TS_LINE = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;
const own = [];
const other = new Map();
for (const line of ts.out.split(/\r?\n/)) {
  const m = TS_LINE.exec(line.trim());
  if (!m) continue;
  const file = m[1].replaceAll('\\', '/');
  const entry = `${file}:${m[2]}:${m[3]} ${m[4]} ${clip(m[5])}`;
  if (!files.length || files.includes(file)) own.push(entry);
  else if (!other.has(file)) other.set(file, [entry]);
  else other.get(file).push(entry);
}
const otherCount = [...other.values()].reduce((n, e) => n + e.length, 0);
if (ts.status === 0) {
  console.log(`typecheck ${pkg}: pass`);
} else if (!own.length && !otherCount) {
  green = false;
  console.log(`typecheck ${pkg}: fail (tsc exit ${ts.status}, unparsed output)`);
  console.log(ts.out.trim().split(/\r?\n/).slice(-15).map((l) => `  ${clip(l)}`).join('\n'));
} else {
  green = false;
  console.log(`typecheck ${pkg}: fail — ${own.length} in your files, ${otherCount} in ${other.size} other file(s)`);
  for (const e of own.slice(0, MAX_OWN_TS_ERRORS)) console.log(`  ${e}`);
  if (own.length > MAX_OWN_TS_ERRORS) console.log(`  … ${own.length - MAX_OWN_TS_ERRORS} more in your files`);
  if (other.size) {
    console.log('  other files (yours only if your change caused them — e.g. a changed export):');
    for (const [, entries] of [...other].slice(0, MAX_OTHER_FILES)) console.log(`    ${entries[0]}${entries.length > 1 ? ` (+${entries.length - 1})` : ''}`);
    if (other.size > MAX_OTHER_FILES) console.log(`    … ${other.size - MAX_OTHER_FILES} more file(s)`);
  }
}

// ── tests ────────────────────────────────────────────────────────────────────
const vitest = path.join(pkgDir, 'node_modules/vitest/vitest.mjs');
if (flags.has('--no-tests')) {
  console.log('tests: skipped (--no-tests)');
} else if (pkg === 'e2e') {
  console.log('tests: e2e flows need a running stack — run by the orchestrator');
} else if (!existsSync(vitest)) {
  usage(`${pkg}/node_modules/vitest is missing — dependencies are not installed`);
} else if (!flags.has('--full') && !files.length) {
  console.log('tests: skipped — pass your files for `related`, or --full');
} else {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'agent-check-'));
  const report = path.join(tmp, 'report.json');
  const mode = flags.has('--full') ? ['run'] : ['related', ...files, '--run'];
  const exclude = pkg === 'server' && !flags.has('--it') ? ['--exclude', '**/*.it.test.ts', '--exclude', '**/node_modules/**'] : [];
  const vt = run(vitest, [...mode, ...exclude, '--passWithNoTests', '--silent', '--reporter=json', `--outputFile=${report}`]);
  let json = null;
  try { json = JSON.parse(readFileSync(report, 'utf8')); } catch { /* reported below */ }
  rmSync(tmp, { recursive: true, force: true });

  const label = flags.has('--full') ? 'full suite' : `related to ${files.length} file(s)`;
  if (!json) {
    green = false;
    console.log(`tests ${pkg} (${label}): fail — vitest produced no report (exit ${vt.status})`);
    console.log(vt.out.trim().split(/\r?\n/).slice(-20).map((l) => `  ${clip(l)}`).join('\n'));
  } else {
    const brokenSuites = json.testResults.filter((s) => s.status === 'failed' && !s.assertionResults.some((a) => a.status === 'failed'));
    const failed = json.testResults.flatMap((s) =>
      s.assertionResults.filter((a) => a.status === 'failed').map((a) => ({ file: path.relative(pkgDir, s.name).replaceAll('\\', '/'), a })),
    );
    const ok = json.success && !failed.length && !brokenSuites.length;
    if (!ok) green = false;
    console.log(
      `tests ${pkg} (${label}): ${ok ? 'pass' : 'fail'} — ${json.numPassedTests} passed, ${json.numFailedTests} failed, ` +
        `${json.numPendingTests + json.numTodoTests} skipped in ${json.testResults.length} file(s)`,
    );
    const trimFailure = (msg) =>
      stripAnsi(msg)
        .split(/\r?\n/)
        .filter((l) => l.trim() && !/node_modules|node:internal/.test(l))
        .slice(0, MAX_FAILURE_LINES)
        .map((l) => `      ${clip(l.trimEnd())}`)
        .join('\n');
    for (const s of brokenSuites.slice(0, MAX_FAILED_TESTS)) {
      console.log(`  ✗ ${path.relative(pkgDir, s.name).replaceAll('\\', '/')} — suite failed to run`);
      if (s.message) console.log(trimFailure(s.message));
    }
    for (const { file, a } of failed.slice(0, MAX_FAILED_TESTS)) {
      console.log(`  ✗ ${file} › ${a.fullName}`);
      console.log(trimFailure(a.failureMessages.join('\n')));
    }
    const shown = Math.min(brokenSuites.length, MAX_FAILED_TESTS) + Math.min(failed.length, MAX_FAILED_TESTS);
    const total = brokenSuites.length + failed.length;
    if (total > shown) console.log(`  … ${total - shown} more failure(s) — fix these first, then re-run`);
  }
}

process.exit(green ? 0 : 1);
