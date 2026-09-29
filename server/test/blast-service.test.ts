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
  const service = new BlastService({ blast: repo, intel, repoIntelEnabled: enabled, maxCallersPerSymbol: 20 });
  return { service, intel, prId, repoId };
}

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
});
