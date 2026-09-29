import { describe, it, expect } from 'vitest';
import { ConfigError, ExternalServiceError, NotFoundError } from '../src/platform/errors.js';
import { MockPrHistorySource } from '../src/adapters/mocks.js';
import { PrHistoryService } from '../src/modules/pr-history/service.js';
import { MAX_HISTORY_FILES, PR_HISTORY_CACHE_TTL_MS } from '../src/modules/pr-history/constants.js';
import type {
  PrHistoryChangedFile,
  PrHistoryPull,
  PrHistoryRepositoryPort,
  PrHistorySourcePort,
} from '../src/modules/pr-history/ports.js';

const WS = 'w1';
const PR_ID = 'pr-1';

class InMemoryRepo implements PrHistoryRepositoryPort {
  constructor(
    private pull: PrHistoryPull,
    private files: PrHistoryChangedFile[],
  ) {}
  async getPull(ws: string, id: string) {
    return ws === WS && id === this.pull.id ? this.pull : null;
  }
  async listChangedFiles() {
    return this.files;
  }
}

const pull: PrHistoryPull = { id: PR_ID, number: 10, base: 'develop', headSha: 'abc', owner: 'acme', name: 'w' };
const hit = { path: 'a.ts', prs: [{ number: 3, title: 'Old', mergedAt: '2026-01-01T00:00:00Z', author: 'al' }] };

function setup(
  opts: { files?: PrHistoryChangedFile[]; source?: MockPrHistorySource; github?: () => Promise<PrHistorySourcePort> } = {},
) {
  const source = opts.source ?? new MockPrHistorySource({ hits: [hit] });
  let t = 1_000;
  const svc = new PrHistoryService({
    pulls: new InMemoryRepo(pull, opts.files ?? [{ path: 'a.ts', churn: 5 }]),
    github: opts.github ?? (async () => source),
    now: () => t,
  });
  return { svc, source, advance: (ms: number) => (t += ms) };
}

describe('PrHistoryService', () => {
  it('404s for a foreign PR', async () => {
    const { svc } = setup();
    await expect(svc.get('other', PR_ID)).rejects.toBeInstanceOf(NotFoundError);
    await expect(svc.get(WS, 'nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('makes no GitHub call when there are no changed files', async () => {
    const { svc, source } = setup({ files: [] });
    expect(await svc.get(WS, PR_ID)).toEqual({
      history: [],
      available: true,
      reason: null,
      files_considered: 0,
      files_total: 0,
    });
    expect(source.calls).toHaveLength(0);
  });

  it('queries only the top files by churn against the base ref', async () => {
    const files = Array.from({ length: MAX_HISTORY_FILES + 3 }, (_, i) => ({
      path: `f${String(i).padStart(2, '0')}.ts`,
      churn: i,
    }));
    const { svc, source } = setup({ files });
    const res = await svc.get(WS, PR_ID);
    expect(source.calls).toHaveLength(1);
    expect(source.calls[0]!.ref).toBe('develop');
    expect(source.calls[0]!.paths).toHaveLength(MAX_HISTORY_FILES);
    expect(source.calls[0]!.paths[0]).toBe('f12.ts');
    expect(res.files_considered).toBe(MAX_HISTORY_FILES);
    expect(res.files_total).toBe(MAX_HISTORY_FILES + 3);
    expect(res.history.map((h) => h.pr_number)).toEqual([3]);
  });

  it('maps failures to available:false and never caches them', async () => {
    const noToken = setup({
      github: async () => {
        throw new ConfigError('no token');
      },
    });
    expect(await noToken.svc.get(WS, PR_ID)).toMatchObject({ available: false, reason: 'no_token', history: [] });

    const limited = setup({
      source: new MockPrHistorySource({ error: new ExternalServiceError('x', { rateLimited: true }) }),
    });
    expect(await limited.svc.get(WS, PR_ID)).toMatchObject({ available: false, reason: 'rate_limited' });

    const generic = setup({ source: new MockPrHistorySource({ error: new Error('boom') }) });
    expect(await generic.svc.get(WS, PR_ID)).toMatchObject({ available: false, reason: 'github_error' });
    await generic.svc.get(WS, PR_ID);
    expect(generic.source.calls).toHaveLength(2);
  });

  it('serves repeat calls from cache within the TTL and refetches after it', async () => {
    const { svc, source, advance } = setup();
    await svc.get(WS, PR_ID);
    await svc.get(WS, PR_ID);
    expect(source.calls).toHaveLength(1);
    advance(PR_HISTORY_CACHE_TTL_MS + 1);
    await svc.get(WS, PR_ID);
    expect(source.calls).toHaveLength(2);
  });
});
