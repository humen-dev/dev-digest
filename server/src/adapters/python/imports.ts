/**
 * Python import resolution (docs/plans/repo-intel-python.md §3.3).
 * Pure: string/set operations over repo-relative POSIX paths, no fs. Always `node:path/posix`
 * (never `node:path`, which yields `\` on Windows).
 */
import { posix } from 'node:path';
import type {
  PyFileEdge,
  PyImport,
  PyImportsOf,
  PyModuleIndex,
  PyResolved,
} from './types.js';

const INIT = '__init__.py';

/** posix.dirname with '.' normalised to '' (repo root). */
function dirOf(p: string): string {
  const d = posix.dirname(p);
  return d === '.' ? '' : d;
}

function joinPath(base: string, rest: string): string {
  return base === '' ? rest : `${base}/${rest}`;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function depth(dir: string): number {
  return dir === '' ? 0 : dir.split('/').length;
}

export function buildModuleIndex(files: readonly string[]): PyModuleIndex {
  const set = new Set<string>();
  for (const f of files) if (f.toLowerCase().endsWith('.py')) set.add(f);

  const managerDirs: string[] = [];
  let hasSrc = false;
  for (const f of set) {
    if (posix.basename(f) === 'manage.py') managerDirs.push(dirOf(f));
    if (f.startsWith('src/')) hasSrc = true;
  }
  managerDirs.sort((a, b) => depth(a) - depth(b) || cmp(a, b));

  const roots: string[] = [];
  const push = (r: string): void => {
    if (!roots.includes(r)) roots.push(r);
  };
  for (const d of managerDirs) push(d);
  if (hasSrc) push('src');
  push('');
  return { files: set, sourceRoots: roots };
}

export function resolveModule(
  index: PyModuleIndex,
  fromFile: string,
  level: number,
  dotted: string,
): string | null {
  const asPath = dotted === '' ? '' : dotted.split('.').join('/');

  if (level >= 1) {
    let base = dirOf(fromFile);
    for (let i = 1; i < level; i++) base = dirOf(base);
    if (asPath === '') {
      const init = joinPath(base, INIT);
      return index.files.has(init) ? init : null;
    }
    const stem = joinPath(base, asPath);
    if (index.files.has(`${stem}.py`)) return `${stem}.py`;
    const init = `${stem}/${INIT}`;
    return index.files.has(init) ? init : null;
  }

  if (asPath === '') return null;
  for (const root of index.sourceRoots) {
    const stem = joinPath(root, asPath);
    if (index.files.has(`${stem}.py`)) return `${stem}.py`;
    const init = `${stem}/${INIT}`;
    if (index.files.has(init)) return init;
  }
  // Suffix fallback: only for multi-segment names (a single segment is a top-level
  // import: stdlib/third-party, never resolved relative to an arbitrary subdirectory),
  // and only when exactly one file matches.
  if (!asPath.includes('/')) return null;
  return suffixLookup(index).get(dotted) ?? null;
}

/** Dotted tail (>= 2 segments, strictly shorter than the full path) -> unique file, or null if ambiguous. */
const SUFFIX_CACHE = new WeakMap<PyModuleIndex, Map<string, string | null>>();

function suffixLookup(index: PyModuleIndex): Map<string, string | null> {
  const cached = SUFFIX_CACHE.get(index);
  if (cached) return cached;
  const map = new Map<string, string | null>();
  for (const f of index.files) {
    const stem = f.endsWith(`/${INIT}`) ? f.slice(0, -(INIT.length + 1)) : f.slice(0, -3);
    const segs = stem.split('/');
    for (let i = 1; i <= segs.length - 2; i++) {
      const key = segs.slice(i).join('.');
      map.set(key, map.has(key) ? null : f);
    }
  }
  SUFFIX_CACHE.set(index, map);
  return map;
}

function subModule(
  index: PyModuleIndex,
  fromFile: string,
  level: number,
  module: string,
  name: string,
): string | null {
  return resolveModule(index, fromFile, level, module === '' ? name : `${module}.${name}`);
}

/** The last non-star `from` import in `file` that binds `local`. */
function findFromBinding(
  imports: readonly PyImport[],
  local: string,
): { imp: PyImport; name: string } | null {
  for (let i = imports.length - 1; i >= 0; i--) {
    const imp = imports[i]!;
    if (imp.kind !== 'from' || imp.star) continue;
    for (const n of imp.names) {
      if ((n.alias ?? n.name) === local) return { imp, name: n.name };
    }
  }
  return null;
}

/** One-hop re-export: `m` is a package `__init__.py` that does `from .x import name`. */
function followReexport(
  index: PyModuleIndex,
  m: string,
  name: string,
  importsOf: PyImportsOf,
): string {
  if (name === '' || !m.endsWith(INIT)) return m;
  const hit = findFromBinding(importsOf(m), name);
  if (!hit) return m;
  const target =
    subModule(index, m, hit.imp.level, hit.imp.module, hit.name) ??
    resolveModule(index, m, hit.imp.level, hit.imp.module);
  return target ?? m;
}

export function resolveImport(
  index: PyModuleIndex,
  fromFile: string,
  imp: PyImport,
  importsOf: PyImportsOf,
): string[] {
  const out = new Set<string>();

  if (imp.kind === 'import') {
    const parts = imp.module.split('.').filter(Boolean);
    for (let n = parts.length; n >= 1; n--) {
      const hit = resolveModule(index, fromFile, 0, parts.slice(0, n).join('.'));
      if (hit) {
        out.add(hit);
        break;
      }
    }
  } else if (imp.star) {
    const hit = resolveModule(index, fromFile, imp.level, imp.module);
    if (hit) out.add(hit);
  } else {
    for (const n of imp.names) {
      const sub = subModule(index, fromFile, imp.level, imp.module, n.name);
      if (sub) {
        out.add(sub);
        continue;
      }
      const m = resolveModule(index, fromFile, imp.level, imp.module);
      if (m) out.add(followReexport(index, m, n.name, importsOf));
    }
  }

  out.delete(fromFile);
  return [...out];
}

export function buildPythonEdges(index: PyModuleIndex, importsOf: PyImportsOf): PyFileEdge[] {
  const seen = new Set<string>();
  const edges: PyFileEdge[] = [];
  for (const from of index.files) {
    for (const imp of importsOf(from)) {
      for (const to of resolveImport(index, from, imp, importsOf)) {
        if (to === from) continue;
        const key = `${from}\u0000${to}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({ from, to });
      }
    }
  }
  edges.sort((a, b) => cmp(a.from, b.from) || cmp(a.to, b.to));
  return edges;
}

/** Longest prefix of `chain` that resolves as an absolute module. */
function longestPrefix(index: PyModuleIndex, chain: readonly string[]): PyResolved | null {
  for (let n = chain.length; n >= 1; n--) {
    const file = resolveModule(index, '', 0, chain.slice(0, n).join('.'));
    if (file) return { file, name: chain[n] ?? '' };
  }
  return null;
}

export function resolveNameToFile(
  index: PyModuleIndex,
  fromFile: string,
  dotted: string,
  importsOf: PyImportsOf,
): PyResolved | null {
  const segs = dotted.split('.').filter(Boolean);
  const h = segs[0];
  if (h === undefined) return null;
  const imports = importsOf(fromFile);

  // 1. Last `from` import binding h — unless a later `import` statement rebinds h
  //    (Python's last binding wins, whichever statement kind it is).
  //    Compare statement order (index in `imports`, which is source order), not
  //    line numbers: `from a import h; import h` on one line must let the import win.
  const found = findFromBinding(imports, h);
  const lastImportIdx = imports.reduce(
    (max, imp, i) => (imp.kind === 'import' && importBinds(imp, h) ? i : max),
    -1,
  );
  const binding = found && imports.indexOf(found.imp) > lastImportIdx ? found : null;
  if (binding) {
    const { imp, name } = binding;
    const sub = subModule(index, fromFile, imp.level, imp.module, name);
    if (sub) {
      const next = segs[1] ?? '';
      return { file: followReexport(index, sub, next, importsOf), name: next };
    }
    const m = resolveModule(index, fromFile, imp.level, imp.module);
    if (m) return { file: followReexport(index, m, name, importsOf), name };
    // The last binding of h is an unresolvable (third-party) `from` import: it
    // shadows any earlier `import h`, so never fall through to a local file.
    return null;
  }

  // 2. An `import` statement binding h.
  for (let i = imports.length - 1; i >= 0; i--) {
    const imp = imports[i]!;
    if (imp.kind !== 'import' || !importBinds(imp, h)) continue;
    const chain = imp.alias !== null ? [...imp.module.split('.'), ...segs.slice(1)] : segs;
    const hit = longestPrefix(index, chain);
    if (hit) return hit;
  }

  return null;
}

/** Whether `import m` / `import m as a` binds the local name `h`. */
function importBinds(imp: PyImport, h: string): boolean {
  return imp.alias !== null ? imp.alias === h : imp.module.split('.')[0] === h;
}

export function resolveDottedString(index: PyModuleIndex, dotted: string): PyResolved | null {
  return longestPrefix(index, dotted.split('.').filter(Boolean));
}
