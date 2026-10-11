/**
 * dependency-checker — filesystem, size, resolution and semver helpers.
 * No dependencies: plain Node >= 22 built-ins only, so it runs before any install.
 */
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';

/** Windows paths never reach a report: normalize once, at the boundary. */
export const posix = (p) => String(p).replace(/\\/g, '/');

export function readJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

export function readText(file) {
  try { return readFileSync(file, 'utf8'); } catch { return null; }
}

export function safeRealpath(p) {
  try { return realpathSync(p); } catch { return null; }
}

/** Directories never scanned for sources or packages. */
export const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'out', 'coverage', '.turbo',
  '.pnpm-store', 'results', 'test-results', 'playwright-report', 'clones', '.devdigest',
  '.claude', '.idea', '.vscode',
]);

/** Find every package.json up to `maxDepth` below root, skipping SKIP_DIRS. */
export function discoverPackages(root, maxDepth = 2) {
  const found = [];
  const walk = (dir, depth) => {
    if (depth > maxDepth) return;
    if (depth > 0 && existsSync(join(dir, 'package.json'))) found.push(dir);
    let entries = [];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (!e.isDirectory() || SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
      walk(join(dir, e.name), depth + 1);
    }
  };
  walk(root, 0);
  if (existsSync(join(root, 'package.json'))) found.unshift(root);
  return found;
}

/** Source-like files of a package (for usage scanning). */
const SRC_EXT = /\.(?:[cm]?[jt]sx?|vue|svelte|astro|css|scss|mdx)$/;
export function listSourceFiles(pkgDir) {
  const out = [];
  const walk = (dir) => {
    let entries = [];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        // a nested package is its own unit — do not count its imports here
        if (existsSync(join(full, 'package.json'))) continue;
        walk(full);
      } else if (e.isFile()) {
        if (SRC_EXT.test(e.name) || /^tsconfig.*\.json$/.test(e.name) || /^\.?(?:babel|eslint|prettier|postcss)rc/.test(e.name)) {
          out.push(full);
        }
      }
    }
  };
  walk(pkgDir);
  return out;
}

/** prod | test | config — decides whether a usage keeps a dep in `dependencies`. */
export function classifyFile(relPath) {
  const p = posix(relPath);
  const name = basename(p);
  if (/(?:^|\/)(?:__tests__|__mocks__|tests?|e2e|fixtures?|test-utils?)\//.test(p) || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(name) || /^(?:vitest|jest|playwright)\.setup/.test(name)) return 'test';
  if (/\.config\.[cm]?[jt]s$/.test(name) || /^tsconfig.*\.json$/.test(name) || /^\./.test(name) || /(?:^|\/)scripts\//.test(p)) return 'config';
  return 'prod';
}

const sizeCache = new Map();
/** Bytes + file count of one installed package dir, excluding nested node_modules and symlinks. */
export function packageSize(realDir) {
  const hit = sizeCache.get(realDir);
  if (hit) return hit;
  let bytes = 0;
  let files = 0;
  const walk = (dir) => {
    let entries = [];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules') continue;
        walk(full);
      } else if (e.isFile()) {
        try { bytes += lstatSync(full).size; files += 1; } catch { /* unreadable file */ }
      }
    }
  };
  walk(realDir);
  const res = { bytes, files };
  sizeCache.set(realDir, res);
  return res;
}

/**
 * Node resolution of `name` starting from a package's real dir. Works for npm
 * (hoisted / nested) and pnpm (.pnpm/<id>/node_modules siblings) alike.
 */
export function resolvePackage(fromDir, name) {
  let dir = fromDir;
  while (true) {
    if (basename(dir) !== 'node_modules') {
      const candidate = join(dir, 'node_modules', ...name.split('/'));
      if (existsSync(join(candidate, 'package.json'))) return safeRealpath(candidate);
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const manifestCache = new Map();
export function manifestOf(realDir) {
  if (!manifestCache.has(realDir)) manifestCache.set(realDir, readJson(join(realDir, 'package.json')) ?? {});
  return manifestCache.get(realDir);
}

/**
 * Transitive closure of an installed package: Set of real dirs (the package itself
 * included). Follows dependencies + optionalDependencies + resolvable peers.
 */
export function closureOf(rootReal) {
  const seen = new Set();
  const stack = [rootReal];
  while (stack.length) {
    const dir = stack.pop();
    if (seen.has(dir)) continue;
    seen.add(dir);
    const m = manifestOf(dir);
    const names = new Set([
      ...Object.keys(m.dependencies ?? {}),
      ...Object.keys(m.optionalDependencies ?? {}),
      ...Object.keys(m.peerDependencies ?? {}),
    ]);
    for (const n of names) {
      const r = resolvePackage(dir, n);
      if (r && !seen.has(r)) stack.push(r);
    }
  }
  return seen;
}

export function sumSizes(dirs) {
  let bytes = 0;
  for (const d of dirs) bytes += packageSize(d).bytes;
  return bytes;
}

/** Total on-disk size of a directory tree (follows nothing; counts every real file once). */
export function treeSize(dir) {
  if (!existsSync(dir)) return null;
  let bytes = 0;
  const walk = (d) => {
    let entries = [];
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      const full = join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) { try { bytes += statSync(full).size; } catch { /* skip */ } }
    }
  };
  walk(dir);
  return bytes;
}

export function humanBytes(n) {
  if (n == null) return 'n/a';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}

/** Major "line" of a version: 0.x versions are breaking on minor, so 0.38 -> "0.38". */
export function majorLine(version) {
  const m = String(version ?? '').match(/(\d+)\.(\d+)/);
  if (!m) return null;
  return m[1] === '0' ? `0.${m[2]}` : m[1];
}

/** Lower bound of a range specifier (^1.2.3, ~1.2, >=1, 1.2.3) — enough for drift checks. */
export function specifierBase(spec) {
  const m = String(spec ?? '').match(/(\d+(?:\.\d+){0,2})/);
  return m ? m[1] : null;
}

/** Specifiers that make an install non-reproducible or opaque. */
export function isLooseSpecifier(spec) {
  const s = String(spec ?? '').trim();
  return s === '' || s === '*' || s === 'latest' || s === 'next' || /^(?:git|https?|github:|file:)/.test(s) || /^>=?\s*\d/.test(s) && !/</.test(s);
}

export function rel(root, p) {
  return posix(relative(root, p)) || '.';
}

export const SEP = sep;
