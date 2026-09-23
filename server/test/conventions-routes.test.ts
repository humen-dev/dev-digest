import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { MockAuthProvider } from '../src/adapters/mocks.js';
import { InMemoryConventionsRepo } from './helpers/conventions-fakes.js';

/**
 * DB-free route tests: zod validation (422 before the handler) and the
 * PATCH /conventions/:id path, which only touches the (overridden) port.
 * `auth` MUST be mocked too — the default auth reads Postgres.
 */
const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const REPO = '00000000-0000-4000-8000-000000000001';

describe('conventions routes (no DB)', () => {
  let app: FastifyInstance;
  const repo = new InMemoryConventionsRepo();
  const row = repo.seed({ workspaceId: 'w1', repoId: REPO, rule: 'Use the @/ alias' });

  beforeAll(async () => {
    app = await buildApp({ config, overrides: { auth: new MockAuthProvider(), conventionsRepo: repo } });
  });
  afterAll(async () => {
    await app.close();
  });

  it('PATCH /conventions/:id accepts, edits inline and returns the contract', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/conventions/${row.id}`,
      payload: { status: 'accepted', rule: 'Import through the @/ alias', rationale: '' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      id: row.id,
      status: 'accepted',
      rule: 'Import through the @/ alias',
      rationale: null,
    });
  });

  it('PATCH /conventions/:id → 404 for an id outside the workspace', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/conventions/${REPO}`,
      payload: { status: 'rejected' },
    });
    expect(res.statusCode).toBe(404);
  });

  it.each([
    ['PATCH', '/conventions/not-a-uuid', { status: 'accepted' }],
    ['PATCH', `/conventions/${REPO}`, {}],
    ['PATCH', `/conventions/${REPO}`, { status: 'maybe' }],
    ['PATCH', `/conventions/${REPO}`, { category: 'vibes' }],
    ['PATCH', `/repos/${REPO}/conventions`, { ids: [], status: 'pending' }],
    ['PATCH', `/repos/${REPO}/conventions`, { ids: ['x'], status: 'pending' }],
    ['POST', '/repos/not-a-uuid/conventions/extract', undefined],
    ['POST', `/repos/${REPO}/conventions/skill`, { name: 'x', description: 'y', type: 'convention', enabled: true, convention_ids: [REPO] }],
    ['POST', `/repos/${REPO}/conventions/skill`, { name: 'x', description: 'y', type: 'nope', enabled: true, body: 'b', convention_ids: [REPO] }],
    ['POST', `/repos/${REPO}/conventions/skill`, { name: 'x', description: 'y', type: 'convention', enabled: true, body: 'b', convention_ids: [] }],
  ] as const)('%s %s with %j → 422', async (method, url, payload) => {
    const res = await app.inject({ method, url, ...(payload !== undefined ? { payload } : {}) });
    expect(res.statusCode).toBe(422);
  });
});
