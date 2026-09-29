/**
 * Python end-to-end: index the `django-mini` fixture into a real Postgres
 * (Testcontainers), then read the blast radius through the RepoIntel facade and
 * through `GET /pulls/:id/blast` (incl. the P3 indirect-impact importer walk).
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
import { INDEXER_VERSION } from '../src/modules/repo-intel/constants.js';
import type { BlastRadiusResponse } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[repo-intel-python] Docker not available — skipping integration tests.');
}

const FIXTURE = resolve(fileURLToPath(new URL('./fixtures/django-mini', import.meta.url)));
const CHANGED = 'apps/tools/phone.py';
const CALLER_FILES = ['apps/contacts/serializers.py', 'apps/contacts/views.py', 'apps/reports/tasks.py'];

const config = () =>
  ({ ...loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv), repoIntelEnabled: true });

d('repo-intel Python blast (Testcontainers pg, django-mini)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;
  let service: RepoIntelService;

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
        name: 'django-mini',
        fullName: 'acme/django-mini',
        clonePath: FIXTURE,
      })
      .returning();
    repoId = r!.id;
    const git = new MockGitClient({ head: 'fixture-sha' });
    service = new RepoIntelService(new Container(config(), db, { git }));
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('indexes the Django fixture and serves blast for a changed helper', async () => {
    const result = await service.indexRepo(repoId);
    expect(result.status).toBe('full');
    const state = await service.getIndexState(repoId);
    expect(state.indexerVersion).toBe(INDEXER_VERSION);
    expect(INDEXER_VERSION).toBe(4);

    const blast = await service.getBlastRadius(repoId, [CHANGED]);
    expect(blast.degraded).toBe(false);

    const changed = blast.changedSymbols.map((s) => s.name);
    expect(changed).toEqual(expect.arrayContaining(['normalize_phone', '_digits']));

    const callerFiles = new Set(blast.callers.map((c) => c.file));
    const hits = CALLER_FILES.filter((f) => callerFiles.has(f));
    expect(hits.length).toBeGreaterThanOrEqual(2);
    for (const c of blast.callers) {
      expect(c.line).toBeGreaterThan(0);
      expect(c.file).not.toContain('/migrations/');
    }

    expect(blast.impactedEndpoints).toEqual(
      expect.arrayContaining(['ANY /', 'POST /api/contacts/import_csv/', 'GET /lookup/']),
    );
    expect(blast.factsByFile?.['apps/reports/tasks.py']?.crons).toContain('0 7 * * 1 (send_weekly_report)');
  });

  it('GET /pulls/:id/blast returns the Python map', async () => {
    const db = pg.handle.db;
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 1,
        title: 'Touch phone helper',
        author: 'dev',
        branch: 'feat/phone',
        base: 'main',
        headSha: 'fixture-sha',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'open',
      })
      .returning();
    await db.insert(t.prFiles).values({ prId: pr!.id, path: CHANGED, additions: 1, deletions: 0 });

    const app = await buildApp({
      config: config(),
      db,
      overrides: { git: new MockGitClient({ head: 'fixture-sha' }) },
    });
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr!.id}/blast` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as BlastRadiusResponse;

    expect(body.degraded).toBe(false);
    expect(body.downstream[0]!.symbol).toBe('normalize_phone');
    expect(body.stats.callers).toBeGreaterThanOrEqual(2);
    expect(body.stats.endpoints).toBeGreaterThanOrEqual(1);
    expect(body.stats.crons).toBeGreaterThanOrEqual(1);

    const indirect = (body.indirect ?? []).find((i) => i.symbol === 'normalize_phone');
    expect(indirect).toBeDefined();
    expect(indirect!.files).toContain('apps/contacts/urls.py');
    await app.close();
  });
});
