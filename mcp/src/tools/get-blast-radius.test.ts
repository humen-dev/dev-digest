import { describe, expect, it } from 'vitest';
import { createFakeApi, IDS, makeCtx } from '../../test/fake-api.js';
import type { ApiBlastRadius } from '../domain/types.js';
import { ApiError } from '../errors.js';
import { formatBlastRadius } from '../format/blast.js';
import { getBlastRadius } from './get-blast-radius.js';

const MAP: ApiBlastRadius = {
  changed_symbols: [{ name: 'refund', file: 'src/refund.ts', kind: 'function' }],
  downstream: [{
    symbol: 'refund',
    callers: [{ name: 'handler', file: 'src/routes.ts', line: 23 }],
    endpoints_affected: ['POST /refunds'],
    crons_affected: [],
  }],
  summary: '1 symbol · 1 caller · 1 endpoint · 0 cron jobs',
  stats: { symbols: 1, callers: 1, endpoints: 1, crons: 0 },
  unattributed_endpoints: [],
  degraded: false,
  reason: null,
};
const ARGS = { repo: 'acme/payments-api', pr: 482 };

describe('getBlastRadius', () => {
  it('returns the formatted map, warming the PR before the blast call', async () => {
    const api = createFakeApi({ blast: { [IDS.pull]: MAP } });
    const result = await getBlastRadius(ARGS, makeCtx(api));
    expect(result).toEqual(formatBlastRadius(MAP, ARGS));
    expect(api.calls.map((c) => c.method)).toEqual(['listRepos', 'listPulls', 'warmPull', 'getBlastRadius']);
    expect(api.calls[3]?.args).toEqual([IDS.pull]);
  });

  it('unknown PR -> pr_not_found without calling getBlastRadius', async () => {
    const api = createFakeApi();
    await expect(getBlastRadius({ ...ARGS, pr: 999 }, makeCtx(api))).rejects.toMatchObject({ code: 'pr_not_found' });
    expect(api.calls.some((c) => c.method === 'getBlastRadius')).toBe(false);
  });

  it('an API 404 on /blast -> pr_not_found', async () => {
    const api = createFakeApi({}, { failOn: { getBlastRadius: new ApiError(404, 'not_found', 'Pull request not found') } });
    await expect(getBlastRadius(ARGS, makeCtx(api))).rejects.toMatchObject({ code: 'pr_not_found' });
  });

  it('a warmPull failure still returns the map', async () => {
    const api = createFakeApi({ blast: { [IDS.pull]: MAP } }, { failOn: { warmPull: new ApiError(500, null, 'boom') } });
    const result = await getBlastRadius(ARGS, makeCtx(api));
    expect(result).toMatchObject({ stats: { callers: 1 } });
  });

  it('a degraded map carries degraded, reason and next', async () => {
    const api = createFakeApi({ blast: { [IDS.pull]: { ...MAP, degraded: true, reason: 'no_data' } } });
    const result = await getBlastRadius(ARGS, makeCtx(api));
    expect(result).toMatchObject({ degraded: true, reason: 'no_data', next: expect.stringContaining('Resync') });
  });
});
