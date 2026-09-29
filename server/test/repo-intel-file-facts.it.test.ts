/**
 * file_facts handler columns round trip against a real Postgres
 * (Testcontainers). Gated on Docker like the other `*.it.test.ts` files.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { RepoIntelRepository } from '../src/modules/repo-intel/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[repo-intel-file-facts] Docker not available — skipping integration tests.');
}

d('RepoIntelRepository file_facts handlers (Testcontainers pg)', () => {
  let pg: PgFixture;
  let repoId: string;
  let repo: RepoIntelRepository;

  beforeAll(async () => {
    pg = await startPg();
    const db = pg.handle.db;
    await seed(db);
    const [ws] = await db.select().from(t.workspaces);
    const [r] = await db
      .insert(t.repos)
      .values({ workspaceId: ws!.id, owner: 'acme', name: 'facts-it', fullName: 'acme/facts-it' })
      .returning();
    repoId = r!.id;
    repo = new RepoIntelRepository(db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('round-trips handler maps; rows without them read back as {}', async () => {
    await repo.replaceFileFacts(repoId, [
      {
        filePath: 'src/a.ts',
        endpoints: ['GET /a', 'GET /b'],
        crons: ['0 2 * * *'],
        endpointHandlers: { 'GET /a': ['listA'] },
        cronHandlers: { '0 2 * * *': ['runNightly'] },
      },
      { filePath: 'src/b.ts', endpoints: ['GET /c'], crons: [] },
    ]);
    // A row inserted directly without the new columns takes the DB default.
    await pg.handle.db
      .insert(t.fileFacts)
      .values({ repoId, filePath: 'src/c.ts', endpoints: ['GET /d'], crons: [] });

    const rows = await repo.getFileFacts(repoId, ['src/a.ts', 'src/b.ts', 'src/c.ts']);
    const byPath = Object.fromEntries(rows.map((r) => [r.filePath, r]));
    expect(byPath['src/a.ts']).toEqual({
      filePath: 'src/a.ts',
      endpoints: ['GET /a', 'GET /b'],
      crons: ['0 2 * * *'],
      endpointHandlers: { 'GET /a': ['listA'] },
      cronHandlers: { '0 2 * * *': ['runNightly'] },
    });
    expect(byPath['src/b.ts']!.endpointHandlers).toEqual({});
    expect(byPath['src/b.ts']!.cronHandlers).toEqual({});
    expect(byPath['src/c.ts']!.endpointHandlers).toEqual({});

    await repo.patchFileFacts(repoId, ['src/b.ts'], [
      { filePath: 'src/b.ts', endpoints: ['GET /c'], crons: [], endpointHandlers: { 'GET /c': ['getC'] } },
    ]);
    const [b] = await repo.getFileFacts(repoId, ['src/b.ts']);
    expect(b!.endpointHandlers).toEqual({ 'GET /c': ['getC'] });
  });
});
