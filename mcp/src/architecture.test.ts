// Static import-rule scan: a lightweight depcruise substitute for this small
// package (plan §U7 step 5 / Decision 6). Excludes test files and test/.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC_DIR = path.resolve(import.meta.dirname);

interface ImportInfo {
  specifier: string;
  typeOnly: boolean;
}

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

// Matches `import [type] {...} from '...'` and `import x from '...'`, non-greedy
// up to the nearest `from`. `[^'"]` matches newlines too, so multi-line named
// import lists are handled without a dotAll flag.
// Re-exports (`export ... from`) create the same dependency as an import.
// Anchored to a statement start (`m` flag) and never crossing a `;`, so a match
// cannot begin at an earlier `export type X = ...;` and borrow its `type`.
const IMPORT_RE = /^\s*(?:import|export)\s+(type\s+)?(?:[^'";]*?)from\s+['"]([^'"]+)['"]/gm;
// Dynamic `import('...')` and side-effect `import '...'` have no `from`.
const DYNAMIC_OR_BARE_RE = /\bimport\s*(?:\(\s*)?['"]([^'"]+)['"]/g;

function extractImports(src: string): ImportInfo[] {
  const out: ImportInfo[] = [];
  for (const m of src.matchAll(IMPORT_RE)) {
    out.push({ specifier: m[2]!, typeOnly: m[1] !== undefined });
  }
  for (const m of src.matchAll(DYNAMIC_OR_BARE_RE)) {
    out.push({ specifier: m[1]!, typeOnly: false });
  }
  return out;
}

/** src-relative module key, e.g. 'domain/types', 'api/http-client', 'server'. */
function toKey(absFile: string): string {
  return path.relative(SRC_DIR, absFile).replace(/\\/g, '/').replace(/\.ts$/, '');
}

/** Resolves a relative import specifier to a src-relative module key; null for
 *  bare (package) specifiers. */
function resolveRelative(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const dir = path.dirname(fromFile);
  const joined = path.normalize(path.join(dir, specifier)).replace(/\.js$/, '.ts');
  return toKey(joined);
}

const FILES = listSourceFiles(SRC_DIR);
const SOURCES = new Map<string, string>(FILES.map((f) => [toKey(f), fs.readFileSync(f, 'utf8')]));
const IMPORTS = new Map<string, ImportInfo[]>(
  [...SOURCES.entries()].map(([key, src]) => [key, extractImports(src)]),
);

const RING1 = new Set([
  'domain/types',
  'domain/tool-definitions',
  'format/agents',
  'format/blast',
  'format/conventions',
  'format/review',
  'format/text',
  'errors',
  'config',
]);

describe('architecture — import rules (U7)', () => {
  it('the MCP SDK is imported only by server.ts and index.ts', () => {
    for (const [key, imports] of IMPORTS) {
      if (key === 'server' || key === 'index') continue;
      const offenders = imports.filter((i) => i.specifier.startsWith('@modelcontextprotocol/sdk'));
      expect(offenders, `${key} must not import the MCP SDK`).toEqual([]);
    }
  });

  it('fetch( is called only in api/http-client.ts', () => {
    for (const [key, src] of SOURCES) {
      if (key === 'api/http-client') continue;
      expect(/\bfetch\s*\(/.test(src), `${key} must not call fetch(`).toBe(false);
    }
  });

  it('api/http-client is imported only by index.ts', () => {
    for (const [key, imports] of IMPORTS) {
      if (key === 'index') continue;
      const offenders = imports
        .map((i) => resolveRelative(path.join(SRC_DIR, `${key}.ts`), i.specifier))
        .filter((r) => r === 'api/http-client');
      expect(offenders, `${key} must not import api/http-client`).toEqual([]);
    }
  });

  it('api/schemas.ts is imported only by api/http-client.ts', () => {
    for (const [key, imports] of IMPORTS) {
      if (key === 'api/http-client') continue;
      const offenders = imports
        .map((i) => resolveRelative(path.join(SRC_DIR, `${key}.ts`), i.specifier))
        .filter((r) => r === 'api/schemas');
      expect(offenders, `${key} must not import api/schemas`).toEqual([]);
    }
  });

  it('new HttpDevDigestApi( appears only in index.ts (and the adapter\'s own withSignal copy)', () => {
    for (const [key, src] of SOURCES) {
      if (key === 'index' || key === 'api/http-client') continue;
      expect(src.includes('new HttpDevDigestApi('), `${key} must not construct HttpDevDigestApi`).toBe(false);
    }
  });

  it('tools/* and format/* never import server.ts', () => {
    for (const [key, imports] of IMPORTS) {
      if (!key.startsWith('tools/') && !key.startsWith('format/')) continue;
      const offenders = imports
        .map((i) => resolveRelative(path.join(SRC_DIR, `${key}.ts`), i.specifier))
        .filter((r) => r === 'server');
      expect(offenders, `${key} must not import server.ts`).toEqual([]);
    }
  });

  it('ring 1 files import only other ring 1 files and zod', () => {
    for (const key of RING1) {
      const imports = IMPORTS.get(key) ?? [];
      for (const imp of imports) {
        const relative = resolveRelative(path.join(SRC_DIR, `${key}.ts`), imp.specifier);
        if (relative === null) {
          expect(imp.specifier, `${key} may only import 'zod' as an external package`).toBe('zod');
        } else {
          expect(RING1.has(relative), `${key} may only import other ring-1 files, got ${relative}`).toBe(true);
        }
      }
    }
  });

  it('domain/types.ts imports nothing', () => {
    expect(IMPORTS.get('domain/types')).toEqual([]);
  });

  it('ports.ts imports only domain/types.ts', () => {
    const imports = IMPORTS.get('ports') ?? [];
    expect(imports.length).toBeGreaterThan(0);
    for (const imp of imports) {
      const relative = resolveRelative(path.join(SRC_DIR, 'ports.ts'), imp.specifier);
      expect(relative, 'ports.ts may only import domain/types.ts').toBe('domain/types');
    }
  });

  it('no value import from @devdigest/shared (type-only drift check only)', () => {
    for (const [key, imports] of IMPORTS) {
      for (const imp of imports) {
        if (!imp.specifier.startsWith('@devdigest/shared')) continue;
        expect(imp.typeOnly, `${key} must import @devdigest/shared as type-only`).toBe(true);
      }
    }
  });

  it('every ring-1 module the rules name still exists (a rename must not silently pass)', () => {
    for (const key of RING1) expect(SOURCES.has(key), `${key}.ts is missing`).toBe(true);
    for (const key of ['ports', 'server', 'index', 'api/http-client', 'api/schemas']) {
      expect(SOURCES.has(key), `${key}.ts is missing`).toBe(true);
    }
  });

  it('the scanner sees re-exports, dynamic and side-effect imports', () => {
    const found = extractImports(
      "export * from './a.js';\nexport { x } from './b.js';\nawait import('./c.js');\nimport './d.js';",
    ).map((i) => i.specifier);
    expect(found).toEqual(expect.arrayContaining(['./a.js', './b.js', './c.js', './d.js']));
  });

  it('the scanner does not mark a value import as type-only because of an earlier type statement', () => {
    const imports = extractImports("export type A = string;\nimport { x } from '@devdigest/shared';");
    expect(imports.find((i) => i.specifier === '@devdigest/shared')).toEqual({ specifier: '@devdigest/shared', typeOnly: false });
  });
});
