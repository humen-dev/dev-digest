import { describe, it, expect } from 'vitest';
import { BlastRadiusResponse } from '@devdigest/shared';
import { attributeIndirect } from '../src/modules/blast/domain/indirect-impact.js';
import { buildBlastRadius } from '../src/modules/blast/domain/build-blast-radius.js';
import type { BlastFileFactsRow, BlastImportEdge } from '../src/modules/blast/ports.js';

const resp = buildBlastRadius(
  {
    changedSymbols: [{ file: 'src/lib.ts', name: 'helper', kind: 'function' }],
    callers: [{ file: 'src/a.ts', symbol: 'a', viaSymbol: 'helper', line: 1, rank: 1 }],
    impactedEndpoints: ['GET /a'],
    factsByFile: { 'src/a.ts': { endpoints: ['GET /a'], crons: ['daily'] } },
  },
  { maxCallersPerSymbol: 20, bfsDepth: 2, degraded: false, reason: null },
);
const edges: BlastImportEdge[] = [
  { fromFile: 'src/b.ts', toFile: 'src/a.ts' }, // hop 2
  { fromFile: 'src/c.ts', toFile: 'src/b.ts' }, // hop 3
];
const facts: BlastFileFactsRow[] = [
  { filePath: 'src/b.ts', endpoints: ['GET /b', 'GET /a'], crons: ['daily', 'weekly'] },
  { filePath: 'src/c.ts', endpoints: ['GET /c'], crons: [] },
];
const opts = { bfsDepth: 2, changedFiles: ['src/lib.ts'], maxFilesPerSymbol: 25 };

describe('attributeIndirect', () => {
  it('depth 2 reaches importers of caller files only; depth 3 goes one hop further', () => {
    const d2 = attributeIndirect(resp, edges, facts, opts);
    expect(d2.indirect[0]!.files).toEqual(['src/b.ts']);
    const d3 = attributeIndirect(resp, edges, facts, { ...opts, bfsDepth: 3 });
    expect(d3.indirect[0]!.files).toEqual(['src/b.ts', 'src/c.ts']);
    expect(d3.indirect[0]!.endpoints).toEqual(['GET /b', 'GET /c']);
  });

  it('subtracts direct endpoints/crons and dedupes stats against direct ones', () => {
    const out = attributeIndirect(resp, edges, facts, opts);
    expect(out.indirect[0]).toEqual({ symbol: 'helper', files: ['src/b.ts'], endpoints: ['GET /b'], crons: ['weekly'] });
    expect(out.indirect_stats).toEqual({ files: 1, endpoints: 1, crons: 1 });
  });

  it('excludes changed and caller files', () => {
    const out = attributeIndirect(
      resp,
      [...edges, { fromFile: 'src/lib.ts', toFile: 'src/a.ts' }, { fromFile: 'src/a.ts', toFile: 'src/a.ts' }],
      facts,
      opts,
    );
    expect(out.indirect[0]!.files).toEqual(['src/b.ts']);
  });

  it('sorts and caps files, and emits no group without reached files', () => {
    const many: BlastImportEdge[] = ['z', 'y', 'x'].map((n) => ({ fromFile: `src/${n}.ts`, toFile: 'src/a.ts' }));
    const capped = attributeIndirect(resp, many, [], { ...opts, maxFilesPerSymbol: 2 });
    expect(capped.indirect[0]!.files).toEqual(['src/x.ts', 'src/y.ts']);
    expect(attributeIndirect(resp, [], [], opts)).toEqual({
      indirect: [],
      indirect_stats: { files: 0, endpoints: 0, crons: 0 },
    });
  });

  it('output stays contract-valid', () => {
    const merged = { ...resp, ...attributeIndirect(resp, edges, facts, opts) };
    expect(BlastRadiusResponse.parse(merged)).toEqual(merged);
  });
});
