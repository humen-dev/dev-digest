/** PrHistoryRepository against a real Postgres (Testcontainers), gated on Docker. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { PrHistoryRepository } from '../src/modules/pr-history/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[pr-history] Docker not available — skipping integration tests.');
}

d('PrHistoryRepository (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repo: PrHistoryRepository;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    repo = new PrHistoryRepository(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('getPull is workspace-scoped and joins owner/name; churn = additions + deletions', async () => {
    const db = pg.handle.db;
    const [r] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'hist-it', fullName: 'acme/hist-it' })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: r!.id,
        number: 12,
        title: 'T',
        author: 'dev',
        branch: 'feat/x',
        base: 'develop',
        headSha: 'cafe',
        additions: 5,
        deletions: 2,
        filesCount: 2,
        status: 'open',
      })
      .returning();
    await db.insert(t.prFiles).values([
      { prId: pr!.id, path: 'src/a.ts', additions: 3, deletions: 1 },
      { prId: pr!.id, path: 'src/b.ts', additions: 2, deletions: 0 },
    ]);

    expect(await repo.getPull(workspaceId, pr!.id)).toEqual({
      id: pr!.id,
      number: 12,
      base: 'develop',
      headSha: 'cafe',
      owner: 'acme',
      name: 'hist-it',
    });
    expect(await repo.getPull('00000000-0000-4000-8000-000000000099', pr!.id)).toBeNull();
    const files = (await repo.listChangedFiles(pr!.id)).sort((a, b) => a.path.localeCompare(b.path));
    expect(files).toEqual([
      { path: 'src/a.ts', churn: 4 },
      { path: 'src/b.ts', churn: 2 },
    ]);
    expect(await repo.listChangedFiles('00000000-0000-4000-8000-000000000099')).toEqual([]);
  });
});
