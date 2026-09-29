import { z } from 'zod';
import { Finding, Verdict } from './findings.js';
import { BlastRadius, Intent, SmartDiff } from './brief.js';

/**
 * A2 — Review-Core API surface contracts. These extend the core
 * Review/Finding/Intent/SmartDiff contracts with the persisted/transport shapes
 * the reviewer endpoints return. A2 owns this file; the barrel re-exports it.
 *
 * Distinct from `Finding` (the raw LLM-output unit): `FindingRecord` adds the
 * persisted row identity + action timestamps so the UI can render accept/dismiss
 * state and the `review_id` it belongs to.
 */

export const FindingRecord = Finding.extend({
  review_id: z.string(),
  accepted_at: z.string().nullable(),
  dismissed_at: z.string().nullable(),
});
export type FindingRecord = z.infer<typeof FindingRecord>;

/** A persisted review with its kept findings + grounding summary. */
export const ReviewRecord = z.object({
  id: z.string(),
  pr_id: z.string(),
  agent_id: z.string().nullable(),
  run_id: z.string().nullable(),
  agent_name: z.string().nullish(),
  kind: z.enum(['summary', 'review']),
  verdict: Verdict.nullable(),
  summary: z.string().nullable(),
  score: z.number().int().nullable(),
  model: z.string().nullable(),
  grounding: z.string().nullish(),
  created_at: z.string(),
  findings: z.array(FindingRecord),
});
export type ReviewRecord = z.infer<typeof ReviewRecord>;

/**
 * Response of `POST /pulls/:id/review`. Each requested agent produces a run that
 * streams over SSE at `/runs/:runId/events`; clients subscribe per run. The
 * persisted reviews are also returned once the (synchronous) run completes.
 */
export const ReviewRunTarget = z.object({
  run_id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
});
export type ReviewRunTarget = z.infer<typeof ReviewRunTarget>;

export const ReviewRunResponse = z.object({
  pr_id: z.string(),
  runs: z.array(ReviewRunTarget),
  reviews: z.array(ReviewRecord),
});
export type ReviewRunResponse = z.infer<typeof ReviewRunResponse>;

// ---- Intent layer ----
export const IntentConfidence = z.enum(['high', 'medium', 'low']);
export type IntentConfidence = z.infer<typeof IntentConfidence>;

export const IntentSourceKind = z.enum([
  'pr_title',
  'pr_body',
  'file_list', // changed paths + hunk headers (never hunk bodies)
  'github_issue', // 'closes/fixes/resolves #N' in the body, same repo
  'repo_doc', // plan/spec file read at the PR head SHA
  'external_link', // any other https URL in the body — fetched only from allowlisted hosts
]);
export type IntentSourceKind = z.infer<typeof IntentSourceKind>;

export const IntentUnresolvedReason = z.enum([
  'not_found',
  'forbidden',
  'no_credentials',
  'fetch_failed',
  'timeout',
  'not_allowlisted',
  'unsupported_content',
  'repo_not_cloned',
  'invalid_ref',
  'limit_exceeded',
]);
export type IntentUnresolvedReason = z.infer<typeof IntentUnresolvedReason>;

export const IntentSource = z.object({
  kind: IntentSourceKind,
  /** '#12' | 'docs/plans/x.md' | URL without query/fragment/userinfo. */
  ref: z.string(),
  title: z.string().nullable(),
  status: z.enum(['resolved', 'unresolved']),
  /** Non-null iff unresolved. */
  reason: IntentUnresolvedReason.nullable(),
  /** Chars sent to the classifier (0 when unresolved). */
  chars: z.number().int().nonnegative(),
  truncated: z.boolean(),
});
export type IntentSource = z.infer<typeof IntentSource>;

/** Intent persisted for a PR. `intent` is the one/two-sentence summary. */
export const PrIntentRecord = Intent.extend({
  pr_id: z.string(),
  /** Null only for legacy rows ⇒ always stale. */
  head_sha: z.string().nullable(),
  confidence: IntentConfidence,
  missing_context: z.array(z.string()),
  out_of_scope_files: z.array(z.string()),
  sources: z.array(IntentSource),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  prompt_tokens_est: z.number().int().nullable(),
  tokens_in: z.number().int().nullable(),
  tokens_out: z.number().int().nullable(),
  /** Real provider cost only — never an estimate. */
  api_cost_usd: z.number().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type PrIntentRecord = z.infer<typeof PrIntentRecord>;

/** Response of GET and POST /pulls/:id/intent. */
export const PrIntentState = z.object({
  pr_id: z.string(),
  current_head_sha: z.string(),
  /** intent exists && intent.head_sha !== current_head_sha */
  stale: z.boolean(),
  intent: PrIntentRecord.nullable(),
});
export type PrIntentState = z.infer<typeof PrIntentState>;

/** What the review engine consumes. */
export const IntentForReview = z.object({
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
  out_of_scope_files: z.array(z.string()),
  confidence: IntentConfidence,
});
export type IntentForReview = z.infer<typeof IntentForReview>;

/** Smart-diff response for a PR (the SmartDiff). */
export const SmartDiffResponse = SmartDiff;
export type SmartDiffResponse = z.infer<typeof SmartDiffResponse>;

/** Why a blast-radius answer is incomplete (mirrors repo-intel `DegradedReason`). */
export const BlastDegradedReason = z.enum([
  'flag_off',
  'index_failed',
  'index_partial',
  'repo_too_large',
  'no_data',
]);
export type BlastDegradedReason = z.infer<typeof BlastDegradedReason>;

/** Precomputed counts so every consumer shows the same numbers. */
export const BlastStats = z.object({
  symbols: z.number().int().nonnegative(),
  callers: z.number().int().nonnegative(),
  endpoints: z.number().int().nonnegative(),
  crons: z.number().int().nonnegative(),
});
export type BlastStats = z.infer<typeof BlastStats>;

/** GET /pulls/:id/blast — the BlastRadius map plus index health. Read-only, never calls a model. */
export const BlastRadiusResponse = BlastRadius.extend({
  stats: BlastStats,
  /** Endpoints reached by the change that could not be attributed to one symbol (fallback path). */
  unattributed_endpoints: z.array(z.string()),
  degraded: z.boolean(),
  /** null exactly when degraded === false. */
  reason: BlastDegradedReason.nullable(),
});
export type BlastRadiusResponse = z.infer<typeof BlastRadiusResponse>;
