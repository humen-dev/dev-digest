import { describe, it, expect } from 'vitest';
import { NotFoundError } from '../src/platform/errors.js';
import { BlastService } from '../src/modules/blast/service.js';
import { FakeRepoIntel, InMemoryBlastRepo, newId } from './helpers/blast-fakes.js';

const WS = 'w1';

function setup(files: string[], enabled = true, status: 'full' | 'partial' = 'full') {
  const repo = new InMemoryBlastRepo();
  const prId = newId();
  const repoId = newId();
  repo.seedPull(WS, prId, repoId, files);
  const intel = new FakeRepoIntel(
    {
      changedSymbols: [{ file: 'src/lib.ts', name: 'helper', kind: 'function' }],
      callers: [{ file: 'src/a.ts', symbol: 'a', viaSymbol: 'helper', line: 3, rank: 1 }],
      impactedEndpoints: [],
    },
    status,
  );
  const service = new BlastService({
    blast: repo,
    intel,
    repoIntelEnabled: enabled,
    maxCallersPerSymbol: 20,
    bfsDepth: 2,
    now: () => 1000,
  });
  return { service, intel, prId, repoId, repo };
}

const recorder = () => {
  const calls: { level: 'info' | 'warn'; obj: Record<string, unknown> }[] = [];
  return {
    calls,
    logger: {
      info: (obj: unknown) => void calls.push({ level: 'info', obj: obj as Record<string, unknown> }),
      warn: (obj: unknown) => void calls.push({ level: 'warn', obj: obj as Record<string, unknown> }),
    },
  };
};

describe('BlastService', () => {
  it('throws NotFoundError for an unknown or other-workspace PR', async () => {
    const { service, prId } = setup(['src/lib.ts']);
    await expect(service.get(WS, newId())).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.get('other-ws', prId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('skips both intel calls when the PR has no changed files', async () => {
    const { service, intel, prId } = setup([]);
    const out = await service.get(WS, prId);
    expect(out).toMatchObject({ degraded: false, reason: null, downstream: [], stats: { symbols: 0, callers: 0 } });
    expect(intel.blastCalls).toHaveLength(0);
    expect(intel.indexCalls).toBe(0);
  });

  it('calls getBlastRadius exactly once with (repoId, files) and returns a healthy map', async () => {
    const { service, intel, prId, repoId } = setup(['src/lib.ts']);
    const out = await service.get(WS, prId);
    expect(intel.blastCalls).toEqual([{ repoId, files: ['src/lib.ts'] }]);
    expect(out.degraded).toBe(false);
    expect(out.downstream[0]!.callers).toEqual([{ name: 'a', file: 'src/a.ts', line: 3 }]);
  });

  it('reports flag_off when repo-intel is disabled, and index_partial for a partial index', async () => {
    const off = setup(['src/lib.ts'], false);
    expect(await off.service.get(WS, off.prId)).toMatchObject({ degraded: true, reason: 'flag_off' });
    const partial = setup(['src/lib.ts'], true, 'partial');
    const out = await partial.service.get(WS, partial.prId);
    expect(out).toMatchObject({ degraded: true, reason: 'index_partial' });
    expect(out.summary).toContain('(index degraded: index_partial)');
  });

  it('logs one persistent_index record, walks imports once and returns indirect endpoints', async () => {
    const { service, intel, prId, repo } = setup(['src/lib.ts']);
    repo.seedEdges([{ fromFile: 'src/route.ts', toFile: 'src/a.ts' }]);
    repo.seedFacts([{ filePath: 'src/route.ts', endpoints: ['GET /r'], crons: [] }]);
    const rec = recorder();
    const out = await service.get(WS, prId, { logger: rec.logger });
    expect(rec.calls).toHaveLength(1);
    expect(rec.calls[0]!.level).toBe('info');
    expect(rec.calls[0]!.obj).toMatchObject({
      event: 'blast.served',
      source: 'persistent_index',
      indexerVersion: 1,
      lastIndexedSha: 'abc',
      edgeQueries: 1,
      astParsed: false,
      graphBuilt: false,
      cloneScanned: false,
      durationMs: 0,
      counts: { symbols: 1, callers: 1, indirectFiles: 1, indirectEndpoints: 1 },
    });
    expect(intel.blastCalls).toHaveLength(1);
    expect(intel.indexRepoCalls).toBe(0);
    expect(intel.refreshCalls).toBe(0);
    expect(out.indirect).toEqual([{ symbol: 'helper', files: ['src/route.ts'], endpoints: ['GET /r'], crons: [] }]);
    expect(out.limits).toEqual({ max_callers_per_symbol: 20, bfs_depth: 2 });
  });

  it('degraded facade result logs warn ripgrep_fallback, no edge queries, no indirect', async () => {
    const repo = new InMemoryBlastRepo();
    const prId = newId();
    repo.seedPull(WS, prId, newId(), ['src/lib.ts']);
    const intel = new FakeRepoIntel(
      {
        changedSymbols: [{ file: 'src/lib.ts', name: 'helper', kind: 'function' }],
        callers: [{ file: 'src/a.ts', symbol: 'a', viaSymbol: 'helper', line: 3, rank: 0 }],
        impactedEndpoints: [],
        degraded: true,
        reason: 'no_data',
      },
      'full',
    );
    const service = new BlastService({
      blast: repo,
      intel,
      repoIntelEnabled: true,
      maxCallersPerSymbol: 20,
      bfsDepth: 2,
    });
    const rec = recorder();
    const out = await service.get(WS, prId, { logger: rec.logger });
    expect(rec.calls).toHaveLength(1);
    expect(rec.calls[0]!.level).toBe('warn');
    expect(rec.calls[0]!.obj).toMatchObject({ source: 'ripgrep_fallback', cloneScanned: true, edgeQueries: 0 });
    expect(repo.importerCalls).toHaveLength(0);
    expect(out.indirect).toEqual([]);
  });

  it('logs skipped_no_files for an empty PR', async () => {
    const { service, prId } = setup([]);
    const rec = recorder();
    await service.get(WS, prId, { logger: rec.logger });
    expect(rec.calls[0]!.obj).toMatchObject({ source: 'skipped_no_files', changedFiles: 0 });
  });
});
