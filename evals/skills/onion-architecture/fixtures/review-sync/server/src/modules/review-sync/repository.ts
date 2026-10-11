import { and, inArray, isNull } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { dbOrTx } from '../../db/tx.js';
import type { Tx } from '../../platform/transaction.js';
import { commentsOfPr, runScope, toSyncRun } from './mappers.js';
import type { ReviewSyncRepositoryPort } from './ports.js';
import type { PostedComment, SyncRun } from './types.js';

export class DrizzleReviewSyncRepository implements ReviewSyncRepositoryPort {
  constructor(private readonly db: Db) {}

  async getRun(workspaceId: string, runId: string): Promise<SyncRun | null> {
    const [row] = await this.db.select().from(t.reviewSyncRuns).where(runScope(workspaceId, runId));
    return row ? toSyncRun(row) : null;
  }

  async listPostedFingerprints(workspaceId: string, prId: string): Promise<Set<string>> {
    const rows = await this.db
      .select({ fp: t.reviewSyncComments.fingerprint })
      .from(t.reviewSyncComments)
      .where(commentsOfPr(workspaceId, prId));
    return new Set(rows.map((r) => r.fp));
  }

  async listPostedCommentIds(workspaceId: string, prId: string): Promise<number[]> {
    const rows = await this.db
      .select({ id: t.reviewSyncComments.githubCommentId })
      .from(t.reviewSyncComments)
      .where(and(commentsOfPr(workspaceId, prId), isNull(t.reviewSyncComments.missingSince)));
    return rows.map((r) => r.id);
  }

  async createRun(
    workspaceId: string,
    input: { reviewId: string; prId: string },
    tx?: Tx,
  ): Promise<SyncRun> {
    const [row] = await dbOrTx(this.db, tx)
      .insert(t.reviewSyncRuns)
      .values({ workspaceId, ...input })
      .returning();
    return toSyncRun(row!);
  }

  async insertComments(
    workspaceId: string,
    runId: string,
    prId: string,
    comments: PostedComment[],
    tx?: Tx,
  ): Promise<void> {
    if (comments.length === 0) return;
    await dbOrTx(this.db, tx)
      .insert(t.reviewSyncComments)
      .values(
        comments.map((c) => ({
          workspaceId,
          syncRunId: runId,
          prId,
          findingId: c.findingId,
          githubCommentId: c.githubCommentId,
          path: c.path,
          line: c.line,
          fingerprint: c.fingerprint,
        })),
      )
      .onConflictDoNothing();
  }

  async finishRun(
    workspaceId: string,
    runId: string,
    result: { postedCount: number; skippedCount: number },
    tx?: Tx,
  ): Promise<SyncRun> {
    const [row] = await dbOrTx(this.db, tx)
      .update(t.reviewSyncRuns)
      .set({
        ...result,
        status: result.skippedCount > 0 ? 'partial' : 'done',
        finishedAt: new Date(),
      })
      .where(runScope(workspaceId, runId))
      .returning();
    return toSyncRun(row!);
  }

  async markMissing(
    workspaceId: string,
    prId: string,
    githubCommentIds: number[],
    at: Date,
    tx?: Tx,
  ): Promise<number> {
    if (githubCommentIds.length === 0) return 0;
    const updated = await dbOrTx(this.db, tx)
      .update(t.reviewSyncComments)
      .set({ missingSince: at })
      .where(
        and(
          commentsOfPr(workspaceId, prId),
          inArray(t.reviewSyncComments.githubCommentId, githubCommentIds),
        ),
      )
      .returning({ id: t.reviewSyncComments.id });
    return updated.length;
  }
}
