import { z } from 'zod';
import {
  ConventionCategory,
  ConventionStatus,
  SkillType,
  type ConventionCandidate,
} from '@devdigest/shared';

/**
 * Module-local zod bodies + internal types. Public DTOs (`ConventionCandidate`,
 * `ConventionBoard`, `ConventionSkillDraft`, …) live in `@devdigest/shared`.
 */

export const PatchConventionBody = z
  .object({
    status: ConventionStatus.optional(),
    rule: z.string().trim().min(1).max(500).optional(),
    rationale: z
      .string()
      .trim()
      .max(1000)
      .nullable()
      .optional()
      .transform((v) => (v === '' ? null : v)),
    category: ConventionCategory.optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: 'Provide at least one of status, rule, rationale, category',
  });
export type PatchConventionBody = z.infer<typeof PatchConventionBody>;

export const BulkStatusBody = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  status: ConventionStatus,
});
export type BulkStatusBody = z.infer<typeof BulkStatusBody>;

export const SkillDraftBody = z
  .object({ ids: z.array(z.string().uuid()).min(1).max(200).optional() })
  .default({});
export type SkillDraftBody = z.infer<typeof SkillDraftBody>;

export const CreateSkillFromConventionsBody = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(500),
  type: SkillType,
  enabled: z.boolean(),
  body: z.string().min(1),
  convention_ids: z.array(z.string().uuid()).min(1).max(200),
  /** Optional: append the new skill to this agent's ordered skill list. */
});
export type CreateSkillFromConventionsBody = z.infer<typeof CreateSkillFromConventionsBody>;

/** A file read for the prompt, after truncation. */
export interface SampledFile {
  path: string;
  kind: 'config' | 'code';
  content: string;
  truncated: boolean;
}

/** One candidate exactly as the model returned it (before the gate). */
export interface ProposedCandidate {
  rule: string;
  rationale: string | null;
  evidence_path: string;
  evidence_line: number | null;
  evidence_snippet: string;
  grep_literal: string | null;
  category: string;
  confidence: number;
}

/** A candidate that passed the evidence gate — path, line and snippet come from the file. */
export interface VerifiedCandidate {
  rule: string;
  rationale: string | null;
  category: ConventionCandidate['category'];
  confidence: number;
  evidencePath: string;
  evidenceLine: number;
  evidenceSnippet: string;
  /** Model-supplied literal, if any — used only by the frequency pass. */
  grepLiteral: string | null;
  occurrences: number | null;
}

export interface ScanCounters {
  proposed: number;
  droppedUngrounded: number;
  droppedDuplicate: number;
  droppedRare: number;
  kept: number;
}
