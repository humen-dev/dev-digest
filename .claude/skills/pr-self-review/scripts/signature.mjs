#!/usr/bin/env node
/**
 * pr-self-review — shared git + signature primitives.
 *
 * Imported by `scripts/pr-self-review.mjs` AND by `.claude/hooks/pr-gate.mjs`, so
 * the CLI and the gate can never disagree about "is this change set already green".
 *
 * Pure Node ESM, zero dependencies, no shell: this ships to every teammate
 * (Windows / macOS / Linux) through `.claude/settings.json`.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const MAX_UNTRACKED_BYTES = 2 * 1024 * 1024;

export function repoRoot(from = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()) {
  let dir = resolve(from);
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir;
    const up = dirname(dir);
    if (up === dir) return resolve(from);
    dir = up;
  }
}

export function git(args, cwd = repoRoot()) {
  const r = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 512 * 1024 * 1024,
  });
  return {
    ok: r.status === 0,
    status: r.status ?? -1,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  };
}

/**
 * CRLF -> LF. Mandatory before hashing or regexing added lines: `core.autocrlf`
 * otherwise flips the signature between a Git-Bash and a PowerShell invocation.
 */
export const normalizeEOL = (s) => String(s).replace(/\r\n/g, '\n');

export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
export const short = (sig) => String(sig || '').slice(0, 8);

/**
 * Merge-base against `origin/main`, falling back to a local `main`.
 * Never fetches — a gate does no network. `ahead` reports how far `origin/main`
 * has moved past the base so a stale base can be surfaced as DET-015.
 */
export function resolveBase(root = repoRoot(), override) {
  if (override) {
    const r = git(['rev-parse', override], root);
    if (r.ok) return { base: r.stdout.trim(), ref: override, ahead: 0 };
  }
  for (const ref of ['origin/main', 'main']) {
    const r = git(['merge-base', ref, 'HEAD'], root);
    if (r.ok && r.stdout.trim()) {
      const base = r.stdout.trim();
      const a = git(['rev-list', '--count', `${base}..origin/main`], root);
      return { base, ref, ahead: a.ok ? Number(a.stdout.trim()) || 0 : 0 };
    }
  }
  const head = git(['rev-parse', 'HEAD'], root);
  return { base: head.stdout.trim(), ref: 'HEAD', ahead: 0 };
}

export function untrackedFiles(root = repoRoot()) {
  const r = git(['ls-files', '--others', '--exclude-standard'], root);
  if (!r.ok) return [];
  return r.stdout.split('\n').map((s) => s.trim()).filter(Boolean).sort();
}

/**
 * Untracked file contents, skipping anything binary or oversized.
 * Synthesized in JS on purpose: `git diff --no-index /dev/null` has no Windows
 * equivalent.
 */
export function untrackedEntries(root = repoRoot()) {
  const out = [];
  for (const path of untrackedFiles(root)) {
    let buf;
    try {
      buf = readFileSync(join(root, path));
    } catch {
      continue;
    }
    if (buf.length > MAX_UNTRACKED_BYTES || buf.includes(0)) {
      out.push({ path, skipped: true, text: '' });
      continue;
    }
    out.push({ path, skipped: false, text: normalizeEOL(buf.toString('utf8')) });
  }
  return out;
}

/**
 * Branch commits + staged + unstaged in one patch. Two-dot against the
 * merge-base already covers all three; only untracked files need synthesizing.
 */
export function trackedPatch(root, base) {
  return git(['diff', '--no-color', '--unified=3', base, '--'], root).stdout;
}

export function currentSignature(root = repoRoot(), baseOverride) {
  const head = git(['rev-parse', 'HEAD'], root).stdout.trim();
  const { base, ref, ahead } = resolveBase(root, baseOverride);
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], root).stdout.trim();
  const patch = normalizeEOL(trackedPatch(root, base));
  const parts = [head, base, patch];
  for (const u of untrackedEntries(root)) parts.push(`${u.path}\0${sha256(u.text)}`);
  return {
    signature: sha256(parts.join('\n')),
    headSha: head,
    base,
    baseRef: ref,
    baseAhead: ahead,
    branch,
  };
}

export const stateDir = (root = repoRoot()) => join(root, '.claude', '.pr-self-review');

export function readState(root = repoRoot()) {
  try {
    return JSON.parse(readFileSync(join(stateDir(root), 'state.json'), 'utf8'));
  } catch {
    return null;
  }
}
