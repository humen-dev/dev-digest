import { z } from 'zod';
import { ProjectDocStatus } from './project-context.js';

/**
 * Intent, Blast radius, Risks, PR History, Smart Diff, PR Brief.
 */

// ---- Intent ----
export const Intent = z.object({
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
});
export type Intent = z.infer<typeof Intent>;

// ---- Blast radius ----
export const ChangedSymbol = z.object({
  name: z.string(),
  file: z.string(),
  kind: z.string(),
});
export type ChangedSymbol = z.infer<typeof ChangedSymbol>;

export const BlastCaller = z.object({
  name: z.string(),
  file: z.string(),
  line: z.number().int(),
});
export type BlastCaller = z.infer<typeof BlastCaller>;

export const DownstreamImpact = z.object({
  symbol: z.string(),
  callers: z.array(BlastCaller),
  endpoints_affected: z.array(z.string()),
  crons_affected: z.array(z.string()),
});
export type DownstreamImpact = z.infer<typeof DownstreamImpact>;

export const BlastRadius = z.object({
  changed_symbols: z.array(ChangedSymbol),
  downstream: z.array(DownstreamImpact),
  summary: z.string(),
});
export type BlastRadius = z.infer<typeof BlastRadius>;

// ---- Risks ----
export const RiskSeverity = z.enum(['high', 'medium', 'low']);
export type RiskSeverity = z.infer<typeof RiskSeverity>;

export const Risk = z.object({
  kind: z.string(),
  title: z.string(),
  explanation: z.string(),
  severity: RiskSeverity,
  file_refs: z.array(z.string()),
});
export type Risk = z.infer<typeof Risk>;

export const Risks = z.object({
  risks: z.array(Risk),
});
export type Risks = z.infer<typeof Risks>;

// ---- PR History ----
export const PrHistoryItem = z.object({
  pr_number: z.number().int(),
  title: z.string(),
  merged_at: z.string(),
  author: z.string(),
  files_overlap: z.array(z.string()),
  notes: z.string(),
});
export type PrHistoryItem = z.infer<typeof PrHistoryItem>;

export const PrHistory = z.object({
  history: z.array(PrHistoryItem),
});
export type PrHistory = z.infer<typeof PrHistory>;

// ---- Smart Diff ----
/** File role in the Smart Diff. The enum ORDER is the display order (core first,
 *  boilerplate last) — consumers read `SmartDiffRole.options`; do not reorder. */
export const SmartDiffRole = z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
export type SmartDiffRole = z.infer<typeof SmartDiffRole>;

export const SmartDiffFile = z.object({
  path: z.string(),
  pseudocode_summary: z.string().nullish(),
  additions: z.number().int(),
  deletions: z.number().int(),
  finding_lines: z.array(z.number().int()),
});
export type SmartDiffFile = z.infer<typeof SmartDiffFile>;

export const SmartDiffGroup = z.object({
  role: SmartDiffRole,
  files: z.array(SmartDiffFile),
});
export type SmartDiffGroup = z.infer<typeof SmartDiffGroup>;

export const ProposedSplit = z.object({
  name: z.string(),
  files: z.array(z.string()),
});
export type ProposedSplit = z.infer<typeof ProposedSplit>;

export const SmartDiff = z.object({
  groups: z.array(SmartDiffGroup),
  split_suggestion: z.object({
    too_big: z.boolean(),
    total_lines: z.number().int(),
    proposed_splits: z.array(ProposedSplit),
  }),
});
export type SmartDiff = z.infer<typeof SmartDiff>;

// ---- PR Brief (SPEC-04) ----
export const ReviewFocusItem = z.object({
  file: z.string(),
  line: z.number().int().positive().nullable(),
  reason: z.string(),
});
export type ReviewFocusItem = z.infer<typeof ReviewFocusItem>;

export const PrBrief = z.object({
  summary: z.string(),
  risks: z.array(Risk),
  review_focus: z.array(ReviewFocusItem),
});
export type PrBrief = z.infer<typeof PrBrief>;

export const BriefDroppedInputKind = z.enum(['blast_caller', 'cron', 'endpoint', 'changed_file', 'context_doc', 'issue_body']);
export type BriefDroppedInputKind = z.infer<typeof BriefDroppedInputKind>;
export const BriefDroppedInput = z.object({ kind: BriefDroppedInputKind, id: z.string() });
export type BriefDroppedInput = z.infer<typeof BriefDroppedInput>;

export const BriefContextDoc = z.object({ path: z.string(), status: ProjectDocStatus, tokens: z.number().int().nullable() });
export type BriefContextDoc = z.infer<typeof BriefContextDoc>;

/** missing_sources values: intent_not_detected | intent_stale | blast_degraded:<reason> | blast_unavailable |
 *  no_linked_issue | linked_issue_unresolved | no_context_docs | pr_body_empty | pr_body_truncated | issue_body_truncated */
export const BriefProvenance = z.object({
  head_sha: z.string(),
  generated_at: z.string(),            // ISO-8601
  provider: z.string(),
  model: z.string(),
  attempts: z.number().int().positive(),
  tokens_in: z.number().int().nonnegative(),
  tokens_out: z.number().int().nonnegative(),
  cost_usd: z.number().nullable(),     // real provider cost only
  context_docs: z.array(BriefContextDoc),
  dropped_inputs: z.array(BriefDroppedInput),
  missing_sources: z.array(z.string()),
});
export type BriefProvenance = z.infer<typeof BriefProvenance>;

/** pr_brief.json */
export const PrBriefRecord = z.object({ brief: PrBrief, provenance: BriefProvenance });
export type PrBriefRecord = z.infer<typeof PrBriefRecord>;

export const BriefStatus = z.enum(['none', 'generating', 'generated', 'outdated', 'refused', 'failed']);
export type BriefStatus = z.infer<typeof BriefStatus>;

/** refused: no_changed_files | over_budget · failed: timeout | llm_error | invalid_output | store_failed · else null */
export const BriefPage = z.object({
  status: BriefStatus,
  reason: z.string().nullable(),
  brief: PrBrief.nullable(),
  provenance: BriefProvenance.nullable(),
  current_head_sha: z.string(),
});
export type BriefPage = z.infer<typeof BriefPage>;

export const GenerateBriefBody = z.object({
  regenerate: z.boolean().optional(),
  context_paths: z.array(z.string().min(1).max(512)).max(50).optional(),
});
export type GenerateBriefBody = z.infer<typeof GenerateBriefBody>;

export const BriefCandidateReason = z.enum(['pr_referenced', 'general', 'scope_touched', 'scope_not_touched']);
export type BriefCandidateReason = z.infer<typeof BriefCandidateReason>;
export const BriefContextCandidate = z.object({
  path: z.string(),
  estimated_tokens: z.number().int().nonnegative(),
  preselected: z.boolean(),
  reason_code: BriefCandidateReason,
  scope: z.string().nullable(), // top-level dir for scoped docs, else null
});
export type BriefContextCandidate = z.infer<typeof BriefContextCandidate>;
export const BriefContextCandidates = z.object({ cloned: z.boolean(), candidates: z.array(BriefContextCandidate) });
export type BriefContextCandidates = z.infer<typeof BriefContextCandidates>;
