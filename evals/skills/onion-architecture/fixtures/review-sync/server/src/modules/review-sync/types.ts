import { z } from 'zod';
import type { RepoRef } from '@devdigest/shared';
import { SYNC_STATUSES } from './constants.js';

export const StartSyncBody = z.object({
  prId: z.string().uuid(),
});
export type StartSyncBody = z.infer<typeof StartSyncBody>;

export const SyncRun = z.object({
  id: z.string().uuid(),
  reviewId: z.string().uuid(),
  prId: z.string().uuid(),
  status: z.enum(SYNC_STATUSES),
  postedCount: z.number().int(),
  skippedCount: z.number().int(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
});
export type SyncRun = z.infer<typeof SyncRun>;

export interface SyncFinding {
  id: string;
  file: string;
  startLine: number;
  severity: string;
  title: string;
  rationale: string;
  suggestion: string | null;
  confidence: number;
}

export interface PullRef {
  repo: RepoRef;
  number: number;
  headSha: string;
}

export interface PlannedComment {
  findingId: string;
  path: string;
  line: number;
  body: string;
  fingerprint: string;
}

export interface PostedComment extends PlannedComment {
  githubCommentId: number;
}

export interface RecheckJobPayload {
  workspaceId: string;
  runId: string;
}
