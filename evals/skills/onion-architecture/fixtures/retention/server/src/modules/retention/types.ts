import { z } from 'zod';

export const RetentionPolicy = z.object({
  repoId: z.string().uuid(),
  keepDays: z.number().int().min(1).max(3650),
  keepLatestPerPr: z.number().int().min(0).max(50),
  lastSweptAt: z.string().nullable(),
});
export type RetentionPolicy = z.infer<typeof RetentionPolicy>;

export const PutRetentionPolicyBody = RetentionPolicy.pick({ keepDays: true, keepLatestPerPr: true });
export type PutRetentionPolicyBody = z.infer<typeof PutRetentionPolicyBody>;

export const SweepResult = z.object({
  deletedReviews: z.number().int(),
  resetPulls: z.number().int(),
});
export type SweepResult = z.infer<typeof SweepResult>;

export interface RetentionJobPayload {
  workspaceId: string;
  repoId: string;
}
