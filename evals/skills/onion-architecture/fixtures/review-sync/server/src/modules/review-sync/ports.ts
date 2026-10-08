import type { Tx } from '../../platform/transaction.js';
import type { PostedComment, PullRef, SyncFinding, SyncRun } from './types.js';

export interface ReviewSyncRepositoryPort {
  getRun(workspaceId: string, runId: string): Promise<SyncRun | null>;
  listPostedFingerprints(workspaceId: string, prId: string): Promise<Set<string>>;
  listPostedCommentIds(workspaceId: string, prId: string): Promise<number[]>;
  createRun(workspaceId: string, input: { reviewId: string; prId: string }, tx?: Tx): Promise<SyncRun>;
  insertComments(workspaceId: string, runId: string, prId: string, comments: PostedComment[], tx?: Tx): Promise<void>;
  finishRun(
    workspaceId: string,
    runId: string,
    result: { postedCount: number; skippedCount: number },
    tx?: Tx,
  ): Promise<SyncRun>;
  markMissing(workspaceId: string, prId: string, githubCommentIds: number[], at: Date, tx?: Tx): Promise<number>;
}

export interface FindingsSourcePort {
  listFindings(workspaceId: string, reviewId: string): Promise<SyncFinding[]>;
}

export interface PullRefSourcePort {
  getPullRef(workspaceId: string, prId: string): Promise<PullRef | null>;
}
