/**
 * Smart-diff repository against a real Postgres (Testcontainers) — the parts
 * that cannot be exercised with an in-memory fake: workspace scoping of
 * `pullExists`, the `kind='review'` filter on `listReviewMeta`, and
 * `listFindingAnchors` returning `dismissed_at`. Gated on Docker, matching the
 * other integration tests (server INSIGHTS 2026-09-21: `*.it.test.ts` only).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { SmartDiffRepository } from '../src/modules/smart-diff/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[smart-diff] Docker not available — skipping integration tests.');
}

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `smart-diff-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 9,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'deadbeef',
      additions: 84,
      deletions: 0,
      filesCount: 1,
      status: 'open',
    })
    .returning();
  await db.insert(t.prFiles).values({ prId: pr!.id, path: 'src/config.ts', additions: 4, deletions: 0 });
  return { repo: repo!, pr: pr! };
}

d('SmartDiffRepository (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repo: SmartDiffRepository;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    repo = new SmartDiffRepository(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('pullExists is workspace-scoped', async () => {
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    expect(await repo.pullExists(workspaceId, pr.id)).toBe(true);
    expect(await repo.pullExists('00000000-0000-4000-8000-000000000099', pr.id)).toBe(false);
  });

  it("listReviewMeta returns only kind='review' rows", async () => {
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const [reviewRow] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId: pr.id, agentId: null, kind: 'review' })
      .returning();
    await pg.handle.db.insert(t.reviews).values({ workspaceId, prId: pr.id, agentId: null, kind: 'summary' });

    const meta = await repo.listReviewMeta(pr.id);
    expect(meta).toHaveLength(1);
    expect(meta[0]!.id).toBe(reviewRow!.id);
  });

  it('listFindingAnchors returns dismissed_at for the given review ids, [] for an empty list', async () => {
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const [reviewRow] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId: pr.id, agentId: null, kind: 'review' })
      .returning();
    const dismissedAt = new Date('2026-01-02T00:00:00Z');
    await pg.handle.db.insert(t.findings).values([
      {
        reviewId: reviewRow!.id,
        file: 'src/config.ts',
        startLine: 12,
        endLine: 12,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded key',
        rationale: 'Do not hardcode secrets.',
        confidence: 0.9,
        dismissedAt,
      },
      {
        reviewId: reviewRow!.id,
        file: 'src/config.ts',
        startLine: 20,
        endLine: 20,
        severity: 'WARNING',
        category: 'style',
        title: 'Nit',
        rationale: 'Minor.',
        confidence: 0.5,
      },
    ]);

    expect(await repo.listFindingAnchors([])).toEqual([]);
    const anchors = await repo.listFindingAnchors([reviewRow!.id]);
    expect(anchors).toHaveLength(2);
    const dismissed = anchors.find((a) => a.startLine === 12)!;
    const kept = anchors.find((a) => a.startLine === 20)!;
    expect(dismissed.dismissedAt).toEqual(dismissedAt);
    expect(kept.dismissedAt).toBeNull();
  });
});
