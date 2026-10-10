import { z } from 'zod';
import { ConventionStatus } from '@devdigest/shared';
import { FINDING_KINDS } from './constants.js';

export const AuditFinding = z.object({
  id: z.string().uuid(),
  skillId: z.string().uuid(),
  kind: z.enum(FINDING_KINDS),
  ref: z.string(),
  status: ConventionStatus,
  createdAt: z.string(),
});
export type AuditFinding = z.infer<typeof AuditFinding>;

export const AuditReport = z.object({
  repoId: z.string().uuid(),
  scannedSkills: z.number().int(),
  findings: z.array(AuditFinding),
});
export type AuditReport = z.infer<typeof AuditReport>;

export interface NewFinding {
  skillId: string;
  kind: (typeof FINDING_KINDS)[number];
  ref: string;
}
