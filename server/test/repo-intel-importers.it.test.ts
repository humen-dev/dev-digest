/**
 * repo-intel `getImporterCounts` round-trips against a real Postgres
 * (Testcontainers). Repository reads straight from `file_edges`; the facade
 * (`RepoIntelService.getImporterCounts`) gates on `config.repoIntelEnabled`
 * and short-circuits on empty `paths` — mirrors `repo-intel-file-facts.it.test.ts`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { RepoIntelRepository } from '../src/modules/repo-intel/repository.js';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import type { Container } from '../src/platform/container.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[repo-intel-importers] Docker not available — skipping integration tests.');
}

function serviceWith(db: unknown, repoIntelEnabled: boolean): RepoIntelService {
  const container = { config: { repoIntelEnabled }, db } as unknown as Container;
  return new RepoIntelService(container);
}

d('repo-intel getImporterCounts (Testcontainers pg)', () => {
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
      .values({ workspaceId: ws!.id, owner: 'acme', name: 'importers-it', fullName: 'acme/importers-it' })
      .returning();
    repoId = r!.id;
    repo = new RepoIntelRepository(db);

    // 3 distinct importers of a.ts, 1 importer of b.ts, none of unimported.ts.
    await db.insert(t.fileEdges).values([
      { repoId, fromFile: 'src/x.ts', toFile: 'a.ts' },
      { repoId, fromFile: 'src/y.ts', toFile: 'a.ts' },
      { repoId, fromFile: 'src/z.ts', toFile: 'a.ts' },
      { repoId, fromFile: 'src/b-importer.ts', toFile: 'b.ts' },
    ]);
    // A duplicate edge (same repo/from/to triple is the PK) must not inflate
    // the distinct-importer count — insert idempotently.
    await db
      .insert(t.fileEdges)
      .values({ repoId, fromFile: 'src/x.ts', toFile: 'a.ts' })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await pg?.stop();
  });

  it('repository: counts distinct importers per path, grouped; missing path is absent', async () => {
    const counts = await repo.getImporterCounts(repoId, ['a.ts', 'b.ts', 'unimported.ts']);
    expect(counts).toEqual({ 'a.ts': 3, 'b.ts': 1 });
    expect(counts['unimported.ts']).toBeUndefined();
  });

  it('repository: empty paths → {}', async () => {
    expect(await repo.getImporterCounts(repoId, [])).toEqual({});
  });

  it('facade: returns the repository result when the flag is on (AC-27)', async () => {
    const service = serviceWith(pg.handle.db, true);
    expect(await service.getImporterCounts(repoId, ['a.ts'])).toEqual({ 'a.ts': 3 });
  });

  it('facade: {} when repoIntelEnabled is false', async () => {
    const service = serviceWith(pg.handle.db, false);
    expect(await service.getImporterCounts(repoId, ['a.ts'])).toEqual({});
  });

  it('facade: {} when paths is empty', async () => {
    const service = serviceWith(pg.handle.db, true);
    expect(await service.getImporterCounts(repoId, [])).toEqual({});
  });
});
