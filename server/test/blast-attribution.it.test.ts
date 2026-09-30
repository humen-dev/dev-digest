/**
 * TS/Express end-to-end for per-handler endpoint/cron attribution: index the
 * `express-mini` fixture (a copy of humen-dev/blast-radius-demo) into a real
 * Postgres (Testcontainers), then read `GET /pulls/:id/blast`.
 * Gated on Docker like the other `*.it.test.ts` files.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { Container } from '../src/platform/container.js';
import { MockGitClient } from '../src/adapters/mocks.js';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import type { BlastRadiusResponse } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[blast-attribution] Docker not available — skipping integration tests.');
}

const FIXTURE = resolve(fileURLToPath(new URL('./fixtures/express-mini', import.meta.url)));
const MONEY = 'src/lib/money.ts';

const config = () =>
  ({ ...loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv), repoIntelEnabled: true });

d('blast per-handler attribution (Testcontainers pg, express-mini)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;
  let n = 0;

  beforeAll(async () => {
    pg = await startPg();
    const db = pg.handle.db;
    await seed(db);
    const [ws] = await db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [r] = await db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'express-mini',
        fullName: 'acme/express-mini',
        clonePath: FIXTURE,
      })
      .returning();
    repoId = r!.id;
    const git = new MockGitClient({ head: 'fixture-sha' });
    const service = new RepoIntelService(new Container(config(), db, { git }));
    expect((await service.indexRepo(repoId)).status).toBe('full');
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function blast(files: string[]): Promise<BlastRadiusResponse> {
    const db = pg.handle.db;
    n += 1;
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: n,
        title: `PR ${n}`,
        author: 'dev',
        branch: `feat/x${n}`,
        base: 'main',
        headSha: 'fixture-sha',
        additions: 1,
        deletions: 0,
        filesCount: files.length,
        status: 'open',
      })
      .returning();
    await db.insert(t.prFiles).values(files.map((path) => ({ prId: pr!.id, path, additions: 1, deletions: 0 })));
    const app = await buildApp({
      config: config(),
      db,
      overrides: { git: new MockGitClient({ head: 'fixture-sha' }) },
    });
    try {
      const res = await app.inject({ method: 'GET', url: `/pulls/${pr!.id}/blast` });
      expect(res.statusCode).toBe(200);
      return res.json() as BlastRadiusResponse;
    } finally {
      await app.close();
    }
  }

  it('attributes each helper only to the handlers that call it (blast-radius-demo #1)', async () => {
    const body = await blast([MONEY]);
    expect(body.degraded).toBe(false);
    const group = (s: string) => body.downstream.find((g) => g.symbol === s);

    expect(group('formatMoney')!.endpoints_affected).toEqual([
      'GET /api/orders',
      'GET /api/orders/:id',
      'POST /api/invoices',
    ]);
    expect(group('formatMoney')!.crons_affected).toEqual(['0 2 * * *']);
    expect(group('roundCents')!.endpoints_affected).toEqual(['GET /api/invoices/tax']);
    expect(group('roundCents')!.crons_affected).toEqual(['0 2 * * *']);

    const cf = (name: string) => (body.caller_facts ?? []).find((c) => c.name === name);
    expect(cf('createInvoice')!.endpoints).toEqual(['POST /api/invoices']);
    expect(cf('previewTax')!.endpoints).toEqual(['GET /api/invoices/tax']);
    expect(group('formatMoney')!.endpoints_affected).not.toContain('GET /api/invoices/tax');
    expect(body.unattributed_endpoints ?? []).toEqual([]);
  });
});
