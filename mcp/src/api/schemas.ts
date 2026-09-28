// src/api/schemas.ts — ring 3: zod schemas parsing only the fields the MCP
// server reads from each API response, plus compile-time drift checks against
// the shared contracts (type-only; erased at runtime, verbatimModuleSyntax).
import { z } from 'zod';
import type {
  Repo, PrMeta, Agent, RunSummary, ConventionCandidate, ConventionBoard, Finding, Verdict,
  FindingRecord, ReviewRecord, ReviewRunTarget,
} from '@devdigest/shared';

// ---- drift check helper (pure type-level; never used at runtime) ----------
type AssertAssignable<A extends B, B> = true;

// ---- Repo -------------------------------------------------------------
export const ApiRepoSchema = z.object({
  id: z.string(),
  owner: z.string(),
  name: z.string(),
  full_name: z.string(),
});
export type ApiRepoParsed = z.infer<typeof ApiRepoSchema>;
type _RepoOk = AssertAssignable<Pick<Repo, 'id' | 'owner' | 'name' | 'full_name'>, ApiRepoParsed>;

// ---- Pull -------------------------------------------------------------
// `PrMeta.id` is nullish in the contract: a PR row without an id cannot be
// addressed (`/pulls/:id/...`), so the list schema drops it instead of
// inventing an empty id that would produce `/pulls//review`.
export const ApiPullSchema = z.object({
  id: z.string().nullish(),
  number: z.number().int(),
  title: z.string(),
  status: z.string(),
});
export type ApiPullParsed = { id: string; number: number; title: string; status: string };
type _PullOk = AssertAssignable<
  { id: NonNullable<PrMeta['id']> } & Pick<PrMeta, 'number' | 'title' | 'status'>,
  ApiPullParsed
>;

// ---- Agent --------------------------------------------------------------
export const ApiAgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  provider: z.string(),
  model: z.string(),
  enabled: z.boolean(),
  ci_fail_on: z.string(),
});
export type ApiAgentParsed = z.infer<typeof ApiAgentSchema>;
type _AgentOk = AssertAssignable<
  Pick<Agent, 'id' | 'name' | 'description' | 'provider' | 'model' | 'enabled' | 'ci_fail_on'>,
  ApiAgentParsed
>;

// ---- Started run (POST /pulls/:id/review) --------------------------------
export const ApiStartedRunSchema = z.object({
  run_id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
});
export const StartReviewResponseSchema = z.object({
  runs: z.array(ApiStartedRunSchema).min(1),
});
export type ApiStartedRunParsed = z.infer<typeof ApiStartedRunSchema>;
type _StartedRunOk = AssertAssignable<ReviewRunTarget, ApiStartedRunParsed>;

// ---- Run summary ----------------------------------------------------------
export const ApiRunSchema = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  status: z.string().nullable(),
  error: z.string().nullable(),
  score: z.number().nullable(),
  blockers: z.number().nullable(),
  findings_count: z.number().nullable(),
  ran_at: z.string().nullable(),
});
export type ApiRunParsed = z.infer<typeof ApiRunSchema>;
type _RunOk = AssertAssignable<
  Pick<
    RunSummary,
    'run_id' | 'agent_id' | 'agent_name' | 'status' | 'error' | 'score' | 'blockers' | 'findings_count' | 'ran_at'
  >,
  ApiRunParsed
>;

// ---- Active run -------------------------------------------------------
export const ApiActiveRunSchema = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
});
export type ApiActiveRunParsed = z.infer<typeof ApiActiveRunSchema>;

// ---- Finding / Review ---------------------------------------------------
export const ApiFindingSchema = z.object({
  id: z.string(),
  severity: z.enum(['CRITICAL', 'WARNING', 'SUGGESTION']),
  category: z.string(),
  title: z.string(),
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  rationale: z.string(),
  confidence: z.number(),
  dismissed_at: z.string().nullable(),
});
export type ApiFindingParsed = z.infer<typeof ApiFindingSchema>;
type _FindingOk = AssertAssignable<
  Pick<
    Finding,
    'id' | 'severity' | 'category' | 'title' | 'file' | 'start_line' | 'end_line' | 'rationale' | 'confidence'
  >,
  Pick<
    ApiFindingParsed,
    'id' | 'severity' | 'category' | 'title' | 'file' | 'start_line' | 'end_line' | 'rationale' | 'confidence'
  >
>;
type _FindingDismissedOk = AssertAssignable<Pick<FindingRecord, 'dismissed_at'>, Pick<ApiFindingParsed, 'dismissed_at'>>;

export const ApiReviewSchema = z.object({
  id: z.string(),
  run_id: z.string().nullable(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable().optional().transform((v) => v ?? null),
  kind: z.enum(['summary', 'review']),
  verdict: z.string().nullable(),
  summary: z.string().nullable(),
  score: z.number().nullable(),
  created_at: z.string(),
  findings: z.array(ApiFindingSchema),
});
export type ApiReviewParsed = z.infer<typeof ApiReviewSchema>;
// verdict is persisted as the shared Verdict enum (or null); confirm it stays
// assignable to the local nullable-string shape if the shared enum changes.
type _ReviewVerdictOk = AssertAssignable<Verdict, NonNullable<ApiReviewParsed['verdict']>>;
type _ReviewOk = AssertAssignable<
  Pick<ReviewRecord, 'id' | 'run_id' | 'agent_id' | 'kind' | 'verdict' | 'summary' | 'score' | 'created_at'>,
  Pick<ApiReviewParsed, 'id' | 'run_id' | 'agent_id' | 'kind' | 'verdict' | 'summary' | 'score' | 'created_at'>
>;
// agent_name is nullish in the contract; the schema normalises undefined → null.
type _ReviewAgentNameOk = AssertAssignable<ReviewRecord['agent_name'], string | null | undefined>;

// ---- Conventions ------------------------------------------------------
export const ApiConventionSchema = z.object({
  id: z.string(),
  rule: z.string(),
  category: z.string(),
  status: z.enum(['pending', 'accepted', 'rejected']),
  evidence_path: z.string(),
  evidence_line: z.number().int(),
  occurrences: z.number().int().nullable(),
  confidence: z.number(),
});
export type ApiConventionParsed = z.infer<typeof ApiConventionSchema>;
type _ConventionOk = AssertAssignable<
  Pick<
    ConventionCandidate,
    'id' | 'rule' | 'category' | 'status' | 'evidence_path' | 'evidence_line' | 'occurrences' | 'confidence'
  >,
  ApiConventionParsed
>;

export const ApiConventionBoardSchema = z.object({
  candidates: z.array(ApiConventionSchema),
  last_scan: z.object({ created_at: z.string() }).nullable(),
});
export type ApiConventionBoardParsed = z.infer<typeof ApiConventionBoardSchema>;
type _ConventionBoardOk = AssertAssignable<
  Pick<ConventionBoard, 'candidates' | 'last_scan'>,
  ApiConventionBoardParsed
>;

// ---- list schemas -------------------------------------------------------
export const ApiRepoListSchema = z.array(ApiRepoSchema);
export const ApiPullListSchema = z
  .array(ApiPullSchema)
  .transform((pulls) =>
    pulls.flatMap((p): ApiPullParsed[] => (p.id ? [{ id: p.id, number: p.number, title: p.title, status: p.status }] : [])),
  );
export const ApiAgentListSchema = z.array(ApiAgentSchema);
export const ApiRunListSchema = z.array(ApiRunSchema);
export const ApiActiveRunListSchema = z.array(ApiActiveRunSchema);
export const ApiReviewListSchema = z.array(ApiReviewSchema);

// ---- error envelope -----------------------------------------------------
export const ApiErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string().nullish(),
    message: z.string().nullish(),
  }),
});
