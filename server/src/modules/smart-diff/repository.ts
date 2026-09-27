import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { FindingAnchorRow, SmartDiffRepositoryPort } from './ports.js';
import type { ReviewMeta, SmartDiffSourceFile } from './types.js';

/**
 * Drizzle implementation of the smart-diff port. Reads `pull_requests`
 * (workspace-scoped existence check only), `pr_files`, `reviews` (kind='review')
 * and `findings` — owns none of these tables (they belong to `pulls`/`reviews`).
 */
export class SmartDiffRepository implements SmartDiffRepositoryPort {
  constructor(private readonly db: Db) {}

  async pullExists(workspaceId: string, prId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.pullRequests.id })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row !== undefined;
  }

  /** Same read shape as `pulls/routes.ts`'s offline select — no `ORDER BY`, no `patch`. */
  async listPrFiles(prId: string): Promise<SmartDiffSourceFile[]> {
    return this.db
      .select({ path: t.prFiles.path, additions: t.prFiles.additions, deletions: t.prFiles.deletions })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
  }

  async listReviewMeta(prId: string): Promise<ReviewMeta[]> {
    return this.db
      .select({ id: t.reviews.id, agentId: t.reviews.agentId, createdAt: t.reviews.createdAt })
      .from(t.reviews)
      .where(and(eq(t.reviews.prId, prId), eq(t.reviews.kind, 'review')));
  }

  async listFindingAnchors(reviewIds: string[]): Promise<FindingAnchorRow[]> {
    if (reviewIds.length === 0) return [];
    return this.db
      .select({
        reviewId: t.findings.reviewId,
        file: t.findings.file,
        startLine: t.findings.startLine,
        dismissedAt: t.findings.dismissedAt,
      })
      .from(t.findings)
      .where(inArray(t.findings.reviewId, reviewIds));
  }
}
