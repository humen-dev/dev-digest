import { z } from 'zod';

/** Query of GET /pulls/:id/multi-agent — omitted → the newest multi-run of the PR (AC-32). */
export const MultiAgentReadQuery = z.object({
  multiRunId: z.string().uuid().optional(),
});
export type MultiAgentReadQuery = z.infer<typeof MultiAgentReadQuery>;

/** Query of GET /multi-agent/runs — keyset page of the workspace's multi-agent runs. */
export const MultiAgentRunsQuery = z.object({
  cursor: z.string().min(1).max(256).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type MultiAgentRunsQuery = z.infer<typeof MultiAgentRunsQuery>;
