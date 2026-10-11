import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { DEFAULT_KEEP_DAYS, DEFAULT_KEEP_LATEST_PER_PR, PROTECTED_VERDICTS } from './constants.js';
import type { RetentionRepositoryPort } from './ports.js';
import type { PutRetentionPolicyBody, RetentionPolicy, SweepResult } from './types.js';

type PolicyRow = typeof t.retentionPolicies.$inferSelect;

function toPolicy(repoId: string, row: PolicyRow | undefined): RetentionPolicy {
  return {
    repoId,
    keepDays: row?.keepDays ?? DEFAULT_KEEP_DAYS,
    keepLatestPerPr: row?.keepLatestPerPr ?? DEFAULT_KEEP_LATEST_PER_PR,
    lastSweptAt: row?.lastSweptAt ? row.lastSweptAt.toISOString() : null,
  };
}

export class RetentionRepository implements RetentionRepositoryPort {
  constructor(private readonly db: Db) {}

  async getPolicy(workspaceId: string, repoId: string): Promise<RetentionPolicy> {
    const [row] = await this.db
      .select()
      .from(t.retentionPolicies)
      .where(and(eq(t.retentionPolicies.workspaceId, workspaceId), eq(t.retentionPolicies.repoId, repoId)));
    return toPolicy(repoId, row);
  }

  async putPolicy(
    workspaceId: string,
    repoId: string,
    body: PutRetentionPolicyBody,
  ): Promise<RetentionPolicy> {
    const [row] = await this.db
      .insert(t.retentionPolicies)
      .values({ workspaceId, repoId, ...body })
      .onConflictDoUpdate({
        target: [t.retentionPolicies.workspaceId, t.retentionPolicies.repoId],
        set: body,
      })
      .returning();
    return toPolicy(repoId, row);
  }

  async purge(
    workspaceId: string,
    repoId: string,
    policy: RetentionPolicy,
    now: Date,
  ): Promise<SweepResult> {
    const rows = await this.db
      .select({
        id: t.reviews.id,
        prId: t.reviews.prId,
        verdict: t.reviews.verdict,
        createdAt: t.reviews.createdAt,
      })
      .from(t.reviews)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.reviews.prId))
      .where(and(eq(t.reviews.workspaceId, workspaceId), eq(t.pullRequests.repoId, repoId)))
      .orderBy(t.reviews.prId, desc(t.reviews.createdAt));

    const cutoff = new Date(now.getTime() - policy.keepDays * 24 * 60 * 60 * 1000);
    const seenPerPr = new Map<string, number>();
    const toDelete: string[] = [];
    const touchedPrs = new Set<string>();
    for (const r of rows) {
      const seen = (seenPerPr.get(r.prId) ?? 0) + 1;
      seenPerPr.set(r.prId, seen);
      if (seen <= policy.keepLatestPerPr) continue;
      if (r.createdAt >= cutoff) continue;
      if (r.verdict && (PROTECTED_VERDICTS as readonly string[]).includes(r.verdict)) continue;
      toDelete.push(r.id);
      touchedPrs.add(r.prId);
    }

    return this.db.transaction(async (tx) => {
      if (toDelete.length > 0) {
        await tx.delete(t.reviews).where(inArray(t.reviews.id, toDelete));
      }
      const fullyPurged = [...touchedPrs].filter(
        (prId) => !rows.some((r) => r.prId === prId && !toDelete.includes(r.id)),
      );
      if (fullyPurged.length > 0) {
        await tx
          .update(t.pullRequests)
          .set({ lastReviewedSha: null, status: 'needs_review' })
          .where(and(eq(t.pullRequests.workspaceId, workspaceId), inArray(t.pullRequests.id, fullyPurged)));
      }
      await tx
        .update(t.retentionPolicies)
        .set({ lastSweptAt: now })
        .where(and(eq(t.retentionPolicies.workspaceId, workspaceId), eq(t.retentionPolicies.repoId, repoId)));
      return { deletedReviews: toDelete.length, resetPulls: fullyPurged.length };
    });
  }
}
