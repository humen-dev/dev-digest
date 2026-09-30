import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { BlastRadiusResponse } from '@devdigest/shared';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { MockAuthProvider } from '../src/adapters/mocks.js';
import { FakeRepoIntel, InMemoryBlastRepo, newId } from './helpers/blast-fakes.js';

/** DB-free route tests; `auth` MUST be mocked too (server INSIGHTS 2026-09-21). */
const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const WORKSPACE = 'w1'; // MockAuthProvider's default workspace id
const OTHER_ID = '00000000-0000-4000-8000-000000000001';

describe('blast routes (no DB)', () => {
  let app: FastifyInstance;
  const repo = new InMemoryBlastRepo();
  const prId = newId();

  beforeAll(async () => {
    repo.seedPull(WORKSPACE, prId, newId(), ['src/lib.ts']);
    const intel = new FakeRepoIntel({
      changedSymbols: [{ file: 'src/lib.ts', name: 'helper', kind: 'function' }],
      callers: [{ file: 'src/a.ts', symbol: 'a', viaSymbol: 'helper', line: 3, rank: 1 }],
      impactedEndpoints: ['GET /a'],
      factsByFile: { 'src/a.ts': { endpoints: ['GET /a'], crons: ['nightly'] } },
    });
    app = await buildApp({
      config: { ...config, repoIntelEnabled: true },
      overrides: { auth: new MockAuthProvider(), blastRepo: repo, repoIntel: intel },
    });
  });
  afterAll(async () => {
    await app.close();
  });

  it('GET /pulls/:id/blast returns a contract-valid map', async () => {
    const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/blast` });
    expect(res.statusCode).toBe(200);
    const body = BlastRadiusResponse.parse(res.json());
    expect(body.degraded).toBe(false);
    expect(body.stats).toEqual({ symbols: 1, callers: 1, endpoints: 1, crons: 1 });
    expect(body.limits).toEqual({ max_callers_per_symbol: 20, bfs_depth: 2 });
  });

  it('GET /pulls/:id/blast → 404 for a PR outside the workspace', async () => {
    const res = await app.inject({ method: 'GET', url: `/pulls/${OTHER_ID}/blast` });
    expect(res.statusCode).toBe(404);
  });

  it('GET /pulls/not-a-uuid/blast → 422', async () => {
    const res = await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/blast' });
    expect(res.statusCode).toBe(422);
  });
});
