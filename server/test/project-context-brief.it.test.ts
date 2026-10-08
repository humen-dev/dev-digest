/**
 * Project Context — PR Brief methods (SPEC-04, U3) over a real Postgres
 * (Testcontainers) and a real on-disk clone. Gated on Docker like the other
 * `*.it.test.ts` files. Fake-port coverage of the per-status logic lives in
 * `project-context-service.test.ts`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { DrizzleProjectContextRepository } from '../src/modules/project-context/repository.js';
import { ProjectContextService } from '../src/modules/project-context/service.js';
import { FsProjectDocs } from '../src/adapters/project-docs/index.js';
import { PrBriefRecord } from '@devdigest/shared';
import { SEED_PR_482_BRIEF } from '../src/db/seed-brief.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[project-context-brief] Docker not available — skipping integration tests.');
}

d('Project Context brief methods (Testcontainers pg + real clone)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let cloneDir: string;
  let service: ProjectContextService;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;

    cloneDir = await mkdtemp(join(tmpdir(), 'project-context-brief-'));
    await mkdir(join(cloneDir, 'docs'), { recursive: true });
    await writeFile(join(cloneDir, 'docs', 'one.md'), '# one\nguidance', 'utf8');

    service = new ProjectContextService({
      repo: new DrizzleProjectContextRepository(pg.handle.db),
      fs: new FsProjectDocs(),
      tokens: { count: (s: string) => s.length },
      excludedDirs: [],
    });
  });
  afterAll(async () => {
    await pg?.stop();
    if (cloneDir) await rm(cloneDir, { recursive: true, force: true });
  });

  it('workspaceAttachedPaths covers enabled agents only and dedupes — AC-30', async () => {
    const db = pg.handle.db;
    const mk = async (name: string, enabled: boolean, paths: string[]) => {
      const [agent] = await db
        .insert(t.agents)
        .values({ workspaceId, name, provider: 'openai', model: 'gpt-4o', systemPrompt: 'x', enabled })
        .returning();
      if (paths.length) {
        await db.insert(t.agentContextDocs).values(paths.map((path, position) => ({ agentId: agent!.id, path, position })));
      }
      return agent!;
    };
    await mk('brief-it-a1', true, ['zz-brief/one.md', 'zz-brief/shared.md']);
    await mk('brief-it-a2', true, ['zz-brief/shared.md', 'zz-brief/two.md']);
    await mk('brief-it-off', false, ['zz-brief/disabled.md']);

    const paths = await service.workspaceAttachedPaths(workspaceId);
    const mine = paths.filter((p) => p.startsWith('zz-brief/'));
    expect(mine).toEqual(['zz-brief/one.md', 'zz-brief/shared.md', 'zz-brief/two.md']);
    expect(paths).not.toContain('zz-brief/disabled.md');
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('readDocsForBrief reads a real clone and rejects traversal', async () => {
    const out = await service.readDocsForBrief(cloneDir, ['docs/one.md', 'docs/none.md', '../../etc/passwd.md']);
    expect(out.map((o) => o.status)).toEqual(['included', 'skipped_missing', 'skipped_unsafe_path']);
    expect(out[0]?.text).toContain('guidance');
  });

  it('seeds a valid brief for PR #482 and is idempotent', async () => {
    const db = pg.handle.db;
    await seed(db); // second run must not throw or duplicate (onConflictDoNothing)
    const [pr] = await db.select().from(t.pullRequests).where(eq(t.pullRequests.number, 482));
    const rows = await db.select().from(t.prBrief).where(eq(t.prBrief.prId, pr!.id));
    expect(rows).toHaveLength(1);
    expect(PrBriefRecord.parse(rows[0]!.json)).toEqual(SEED_PR_482_BRIEF);
  });
});
