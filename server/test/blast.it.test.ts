/**
 * BlastRepository against a real Postgres (Testcontainers): workspace scoping
 * of `getPull` and the `pr_files` read. Gated on Docker like the other
 * integration tests (server INSIGHTS 2026-09-21: `*.it.test.ts` only).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { BlastRepository } from '../src/modules/blast/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[blast] Docker not available — skipping integration tests.');
}

d('BlastRepository (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repo: BlastRepository;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    repo = new BlastRepository(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('getPull is workspace-scoped and listChangedFiles returns the paths', async () => {
    const db = pg.handle.db;
    const [r] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'blast-it', fullName: 'acme/blast-it' })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: r!.id,
        number: 7,
        title: 'Touch helper',
        author: 'dev',
        branch: 'feat/x',
        base: 'main',
        headSha: 'deadbeef',
        additions: 3,
        deletions: 1,
        filesCount: 2,
        status: 'open',
      })
      .returning();
    await db.insert(t.prFiles).values([
      { prId: pr!.id, path: 'src/a.ts', additions: 2, deletions: 0 },
      { prId: pr!.id, path: 'src/b.ts', additions: 1, deletions: 1 },
    ]);

    expect(await repo.getPull(workspaceId, pr!.id)).toEqual({ id: pr!.id, repoId: r!.id });
    expect(await repo.getPull('00000000-0000-4000-8000-000000000099', pr!.id)).toBeNull();
    expect((await repo.listChangedFiles(pr!.id)).sort()).toEqual(['src/a.ts', 'src/b.ts']);
    expect(await repo.listChangedFiles('00000000-0000-4000-8000-000000000099')).toEqual([]);
  });
});
