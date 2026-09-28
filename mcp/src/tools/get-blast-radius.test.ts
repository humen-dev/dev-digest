import { describe, expect, it } from 'vitest';
import { createFakeApi, makeCtx } from '../../test/fake-api.js';
import { getBlastRadius } from './get-blast-radius.js';

describe('getBlastRadius', () => {
  it('always throws not_implemented, names get_findings and get_conventions, and makes no API call', async () => {
    const api = createFakeApi();
    const ctx = makeCtx(api);

    await expect(getBlastRadius({ repo: 'acme/payments-api', pr: 482 }, ctx)).rejects.toMatchObject({
      code: 'not_implemented',
      next: expect.stringContaining('get_findings'),
    });
    await expect(getBlastRadius({ repo: 'acme/payments-api', pr: 482 }, ctx)).rejects.toMatchObject({
      next: expect.stringContaining('get_conventions'),
    });
    expect(api.calls).toEqual([]);
  });
});
