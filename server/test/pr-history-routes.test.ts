import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrHistoryResponse } from '@devdigest/shared';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { MockAuthProvider, MockPrHistorySource } from '../src/adapters/mocks.js';
import type { PrHistoryRepositoryPort } from '../src/modules/pr-history/ports.js';

/** DB-free route tests; `auth` MUST be mocked too (server INSIGHTS 2026-09-21). */
const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const PR_ID = '00000000-0000-4000-8000-0000000000aa';
const OTHER_ID = '00000000-0000-4000-8000-000000000001';

const repo: PrHistoryRepositoryPort = {
  async getPull(ws, id) {
    return ws === 'w1' && id === PR_ID
      ? { id: PR_ID, number: 10, base: 'main', headSha: 'abc', owner: 'acme', name: 'w' }
      : null;
  },
  async listChangedFiles() {
    return [{ path: 'src/a.ts', churn: 4 }];
  },
};

function makeApp(source: MockPrHistorySource) {
  return buildApp({ config, overrides: { auth: new MockAuthProvider(), prHistoryRepo: repo, prHistorySource: source } });
}

describe('pr-history routes (no DB)', () => {
  let ok: FastifyInstance;
  let failing: FastifyInstance;

  beforeAll(async () => {
    ok = await makeApp(
      new MockPrHistorySource({
        hits: [{ path: 'src/a.ts', prs: [{ number: 3, title: 'Old', mergedAt: '2026-01-01T00:00:00Z', author: 'al' }] }],
      }),
    );
    failing = await makeApp(new MockPrHistorySource({ error: new Error('boom') }));
  });
  afterAll(async () => {
    await ok.close();
    await failing.close();
  });

  it('200 contract-valid history', async () => {
    const res = await ok.inject({ method: 'GET', url: `/pulls/${PR_ID}/history` });
    expect(res.statusCode).toBe(200);
    const body = PrHistoryResponse.parse(res.json());
    expect(body.available).toBe(true);
    expect(body.history[0]).toMatchObject({ pr_number: 3, files_overlap: ['src/a.ts'], notes: '' });
  });

  it('200 available:false when the source throws', async () => {
    const res = await failing.inject({ method: 'GET', url: `/pulls/${PR_ID}/history` });
    expect(res.statusCode).toBe(200);
    expect(PrHistoryResponse.parse(res.json())).toMatchObject({
      available: false,
      reason: 'github_error',
      history: [],
    });
  });

  it('404 outside the workspace, 422 on a non-uuid', async () => {
    expect((await ok.inject({ method: 'GET', url: `/pulls/${OTHER_ID}/history` })).statusCode).toBe(404);
    expect((await ok.inject({ method: 'GET', url: '/pulls/not-a-uuid/history' })).statusCode).toBe(422);
  });
});
