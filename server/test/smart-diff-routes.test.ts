import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { SmartDiffResponse } from '@devdigest/shared';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { MockAuthProvider } from '../src/adapters/mocks.js';
import { InMemorySmartDiffRepo, newId } from './helpers/smart-diff-fakes.js';

/**
 * DB-free route tests: zod validation (422 before the handler) and the happy
 * path over an in-memory port. `auth` MUST be mocked too — the default auth
 * reads Postgres (server INSIGHTS 2026-09-21).
 */
const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const WORKSPACE = 'w1'; // MockAuthProvider's default workspace id
const OTHER_ID = '00000000-0000-4000-8000-000000000001';

describe('smart-diff routes (no DB)', () => {
  let app: FastifyInstance;
  const repo = new InMemorySmartDiffRepo();
  const prId = newId();

  beforeAll(async () => {
    repo.seedPull(WORKSPACE, prId);
    repo.seedFiles(prId, [
      { path: 'README.md', additions: 2, deletions: 0 },
      { path: 'src/config.ts', additions: 4, deletions: 0 },
      { path: 'src/config.test.ts', additions: 10, deletions: 0 },
    ]);
    app = await buildApp({ config, overrides: { auth: new MockAuthProvider(), smartDiffRepo: repo } });
  });
  afterAll(async () => {
    await app.close();
  });

  it('GET /pulls/:id/smart-diff returns groups in fixed role order', async () => {
    const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = SmartDiffResponse.parse(res.json());
    expect(body.groups.map((g) => g.role)).toEqual(['core', 'tests', 'docs']);
  });

  it('GET /pulls/:id/smart-diff → 404 for a PR outside the workspace', async () => {
    const res = await app.inject({ method: 'GET', url: `/pulls/${OTHER_ID}/smart-diff` });
    expect(res.statusCode).toBe(404);
  });

  it('GET /pulls/not-a-uuid/smart-diff → 422', async () => {
    const res = await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/smart-diff' });
    expect(res.statusCode).toBe(422);
  });
});
