import { describe, expect, it } from 'vitest';
import { createFakeApi, IDS, makeCtx } from '../../test/fake-api.js';
import { getConventions } from './get-conventions.js';
import type { ApiConvention, ConventionsResult } from '../domain/types.js';

function convention(over: Partial<ApiConvention>): ApiConvention {
  return {
    id: 'c1',
    rule: 'Use camelCase for functions',
    category: 'naming',
    status: 'accepted',
    evidence_path: 'src/foo.ts',
    evidence_line: 12,
    occurrences: 5,
    confidence: 0.9,
    ...over,
  };
}

describe('getConventions', () => {
  it('returns accepted rules only by default', async () => {
    const api = createFakeApi({
      conventions: {
        [IDS.repo]: {
          candidates: [
            convention({ id: 'a', status: 'accepted' }),
            convention({ id: 'b', status: 'pending' }),
          ],
          last_scan: { created_at: '2026-01-01T00:00:00.000Z' },
        },
      },
    });
    const ctx = makeCtx(api);

    const result = (await getConventions({ repo: 'acme/payments-api' }, ctx)) as ConventionsResult;

    expect(result.status).toBe('accepted');
    expect(result.conventions).toHaveLength(1);
  });

  it('returns all statuses with status: "all"', async () => {
    const api = createFakeApi({
      conventions: {
        [IDS.repo]: {
          candidates: [
            convention({ id: 'a', status: 'accepted' }),
            convention({ id: 'b', status: 'pending' }),
          ],
          last_scan: { created_at: '2026-01-01T00:00:00.000Z' },
        },
      },
    });
    const ctx = makeCtx(api);

    const result = (await getConventions({ repo: 'acme/payments-api', status: 'all' }, ctx)) as ConventionsResult;

    expect(result.conventions).toHaveLength(2);
  });

  it('throws no_conventions when the board is empty and never scanned', async () => {
    const api = createFakeApi();
    const ctx = makeCtx(api);

    await expect(getConventions({ repo: 'acme/payments-api' }, ctx)).rejects.toMatchObject({
      code: 'no_conventions',
      next: expect.stringContaining('Conventions'),
    });
  });

  it('rejects an unknown category with invalid_argument', async () => {
    const api = createFakeApi({
      conventions: {
        [IDS.repo]: { candidates: [convention({})], last_scan: null },
      },
    });
    const ctx = makeCtx(api);

    await expect(
      getConventions({ repo: 'acme/payments-api', category: 'bogus' }, ctx),
    ).rejects.toMatchObject({ code: 'invalid_argument' });
  });
});
