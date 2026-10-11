import { and, eq, type SQL } from 'drizzle-orm';
import * as t from '../../db/schema.js';
import type { SyncRun } from './types.js';

type RunRow = typeof t.reviewSyncRuns.$inferSelect;

export function toSyncRun(row: RunRow): SyncRun {
  return {
    id: row.id,
    reviewId: row.reviewId,
    prId: row.prId,
    status: row.status,
    postedCount: row.postedCount,
    skippedCount: row.skippedCount,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
  };
}

export function runScope(workspaceId: string, runId: string): SQL | undefined {
  return and(eq(t.reviewSyncRuns.workspaceId, workspaceId), eq(t.reviewSyncRuns.id, runId));
}

export function commentsOfPr(workspaceId: string, prId: string): SQL | undefined {
  return and(eq(t.reviewSyncComments.workspaceId, workspaceId), eq(t.reviewSyncComments.prId, prId));
}
