import { z } from 'zod';

/** Query of GET /pulls/:id/multi-agent — omitted → the newest multi-run of the PR (AC-32). */
export const MultiAgentReadQuery = z.object({
  multiRunId: z.string().uuid().optional(),
});
export type MultiAgentReadQuery = z.infer<typeof MultiAgentReadQuery>;
