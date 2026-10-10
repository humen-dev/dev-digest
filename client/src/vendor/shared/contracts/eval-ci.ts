import { z } from 'zod';
import { Verdict, Finding } from './findings.js';
import {
  EvalActualFinding,
  EvalCase,
  EvalCaseMeta,
  EvalCaseOutcome,
  EvalExpectation,
  EvalRunMetrics,
  Conformance,
} from './knowledge.js';

/**
 * A4 — Eval / CI / Compose / Conformance API contracts (L06).
 *
 * These EXTEND the barrel; they do not modify existing contract files. The base
 * `EvalRun`, `EvalCase`, `EvalOwnerKind`, `Conformance` live in `knowledge.ts`;
 * here we add the *API-facing* request/response shapes (records persisted in
 * `eval_runs`, `composed_reviews`, `ci_installations`, `ci_runs`,
 * `conformance_checks`) plus the eval-dashboard aggregate.
 */

// ===========================================================================
// Eval — case input + persisted run record + dashboard
// ===========================================================================

const Ratio = z.number().min(0).max(1).nullable();
const Name = z.string().trim().min(1).max(120);
const Notes = z.string().max(2000);

/** Create payload for an eval case (owner resolved from the route). */
export const EvalCaseInput = z
  .object({
    name: Name,
    notes: Notes.nullish(),
    input_diff: z.string().min(1),
    pr_title: z.string(),
    pr_body: z.string().nullable(),
    expectation: EvalExpectation,
  })
  .strict();
export type EvalCaseInput = z.infer<typeof EvalCaseInput>;

export const EvalCasePatch = z
  .object({
    name: Name,
    notes: Notes.nullable(),
    input_diff: z.string().min(1),
    pr_title: z.string(),
    pr_body: z.string().nullable(),
    expectation: EvalExpectation,
  })
  .partial()
  .strict();
export type EvalCasePatch = z.infer<typeof EvalCasePatch>;

export const EvalCaseListItem = EvalCase.extend({
  last: z
    .object({
      run_id: z.string(),
      status: z.enum(['pass', 'fail', 'errored']),
      findings_matched: z.number().int().nullable(),
    })
    .nullable(),
});
export type EvalCaseListItem = z.infer<typeof EvalCaseListItem>;

export const EvalCaseDetail = EvalCase.extend({
  source: z.object({ repo_id: z.string(), pr_number: z.number().int() }).nullable(),
  source_deleted: z.boolean(),
  last_outcome: z.object({ run_id: z.string(), outcome: EvalCaseOutcome }).nullable(),
});
export type EvalCaseDetail = z.infer<typeof EvalCaseDetail>;

export const EvalSkillRef = z.object({
  skill_id: z.string(),
  name: z.string(),
  version: z.number().int(),
});
export type EvalSkillRef = z.infer<typeof EvalSkillRef>;

export const EvalRunStatus = z.enum(['running', 'completed', 'errored']);
export type EvalRunStatus = z.infer<typeof EvalRunStatus>;

export const EvalRunRecord = z.object({
  id: z.string(),
  agent_id: z.string(),
  agent_name: z.string().nullable(),
  agent_version: z.number().int(),
  skills_fingerprint: z.array(EvalSkillRef),
  skills_delta: z.boolean(),
  status: EvalRunStatus,
  error_reason: z.string().nullable(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  case_ids: z.array(z.string()),
  metrics: EvalRunMetrics.nullable(),
});
export type EvalRunRecord = z.infer<typeof EvalRunRecord>;

export const EvalRunDetail = EvalRunRecord.extend({ per_case: z.array(EvalCaseOutcome) });
export type EvalRunDetail = z.infer<typeof EvalRunDetail>;

export const EvalRunEstimate = z.object({ agent_id: z.string(), cases_total: z.number().int() });
export type EvalRunEstimate = z.infer<typeof EvalRunEstimate>;

export const EvalRunStarted = z.object({ run_id: z.string(), status: z.literal('running') });
export type EvalRunStarted = z.infer<typeof EvalRunStarted>;

export const EvalRunAllResult = z.object({
  results: z.array(
    z.object({
      agent_id: z.string(),
      agent_name: z.string(),
      outcome: z.enum(['started', 'refused']),
      run_id: z.string().nullable(),
      reason: z.string().nullable(),
      details: z.record(z.string(), z.unknown()).nullable(),
    }),
  ),
});
export type EvalRunAllResult = z.infer<typeof EvalRunAllResult>;

/** One point on the trend (per completed run, chronological). */
export const EvalTrendPoint = z.object({
  run_id: z.string(),
  ran_at: z.string(),
  agent_version: z.number().int(),
  recall: Ratio,
  precision: Ratio,
  citation_accuracy: Ratio,
  cases_passed: z.number().int(),
  cases_total: z.number().int(),
});
export type EvalTrendPoint = z.infer<typeof EvalTrendPoint>;

export const EvalMetricKey = z.enum(['recall', 'precision', 'citation_accuracy']);
export type EvalMetricKey = z.infer<typeof EvalMetricKey>;

export const EvalBanner = z.object({
  metric: EvalMetricKey,
  direction: z.enum(['up', 'down']),
  points: z.number(),
  agent_version: z.number().int(),
  transitions: z.array(
    z.object({
      case_id: z.string(),
      name: z.string(),
      from: z.enum(['pass', 'fail']),
      to: z.enum(['pass', 'fail']),
    }),
  ),
});
export type EvalBanner = z.infer<typeof EvalBanner>;

export const EvalAgentSummary = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  model: z.string(),
  cases_total: z.number().int(),
  latest: EvalRunRecord.nullable(),
  trend: z.array(EvalTrendPoint),
});
export type EvalAgentSummary = z.infer<typeof EvalAgentSummary>;

export const EvalDashboard = z.object({
  agents: z.array(EvalAgentSummary),
  recent_runs: z.array(EvalRunRecord),
});
export type EvalDashboard = z.infer<typeof EvalDashboard>;

export const EvalAgentDetail = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  model: z.string(),
  cases_total: z.number().int(),
  running: EvalRunRecord.nullable(),
  latest: EvalRunRecord.nullable(),
  previous: EvalRunRecord.nullable(),
  runs: z.array(EvalRunRecord),
  trend: z.array(EvalTrendPoint),
  banner: EvalBanner.nullable(),
});
export type EvalAgentDetail = z.infer<typeof EvalAgentDetail>;

const Delta = z.object({
  older: z.number().nullable(),
  newer: z.number().nullable(),
  delta: z.number().nullable(),
});

export const EvalCompare = z.object({
  older: EvalRunRecord,
  newer: EvalRunRecord,
  common_case_ids: z.array(z.string()),
  only_in_older: z.array(z.object({ case_id: z.string(), name: z.string() })),
  only_in_newer: z.array(z.object({ case_id: z.string(), name: z.string() })),
  metrics: z.object({
    recall: Delta,
    precision: Delta,
    citation_accuracy: Delta,
    cost_usd: Delta,
  }),
  prompt_diff: z
    .array(z.object({ op: z.enum(['add', 'remove', 'same']), text: z.string() }))
    .nullable(),
  missing_snapshot_versions: z.array(z.number().int()),
  skills_diff: z.array(
    z.object({
      skill_id: z.string(),
      name: z.string(),
      change: z.enum(['added', 'removed', 'changed']),
      from_version: z.number().int().nullable(),
      to_version: z.number().int().nullable(),
    }),
  ),
});
export type EvalCompare = z.infer<typeof EvalCompare>;

export const EvalCompareQuery = z.object({ a: z.string().uuid(), b: z.string().uuid() });
export type EvalCompareQuery = z.infer<typeof EvalCompareQuery>;

/** A draft built from a triaged finding (SPEC-06 AC-1, AC-5–AC-7, AC-11). Never stored. */
export const EvalCaseDraft = z.object({
  agent_id: z.string(), agent_name: z.string(), source_finding_id: z.string(),
  name: z.string(), input_diff: z.string(), input_files: z.array(z.string()),
  input_meta: EvalCaseMeta, expectation: EvalExpectation,
  severity: z.string().nullable(), category: z.string().nullable(),
});
export type EvalCaseDraft = z.infer<typeof EvalCaseDraft>;
/** GET /findings/:id/eval-case-draft — a draft, or the finding's existing case (AC-2). */
export const EvalCaseDraftResponse = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('draft'), draft: EvalCaseDraft }),
  z.object({ kind: z.literal('existing_case'), case_id: z.string(), owner_id: z.string() }),
]);
export type EvalCaseDraftResponse = z.infer<typeof EvalCaseDraftResponse>;
/** POST /agents/:id/eval-cases/run — the modal's current values (AC-94, AC-108). */
export const EvalCaseRunInput = z.object({ input_diff: z.string().min(1), pr_title: z.string(),
  pr_body: z.string().nullable(), expectation: EvalExpectation }).strict();
export type EvalCaseRunInput = z.infer<typeof EvalCaseRunInput>;
/** Dry-run result; nothing is stored (AC-95). `masked` is what was sent to the model (EC-32). */
export const EvalCaseRunResult = z.object({
  status: z.enum(['scored', 'errored']), pass: z.boolean().nullable(), error_reason: z.string().nullable(),
  findings_total: z.number().int(), findings_matched: z.number().int(), actual: z.array(EvalActualFinding),
  duration_ms: z.number().int(), cost_usd: z.number().nullable(), agent_version: z.number().int(),
  masked: z.object({ input_diff: z.string(), pr_title: z.string(), pr_body: z.string().nullable() }),
});
export type EvalCaseRunResult = z.infer<typeof EvalCaseRunResult>;

// ===========================================================================
// Compose Review
// ===========================================================================

export const ComposeReviewInput = z.object({
  /** Finding ids to fold into the draft (optional — body may be hand-written). */
  finding_ids: z.array(z.string()).default([]),
  /** Editable markdown body. If omitted, the server composes one from findings. */
  body: z.string().nullish(),
  verdict: Verdict.default('comment'),
  /** When true, attach selected findings as inline comments (path+line+body). */
  inline_comments: z.boolean().default(false),
});
export type ComposeReviewInput = z.infer<typeof ComposeReviewInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type ComposeReviewInputBody = z.input<typeof ComposeReviewInput>;

/** A persisted composed review (mirrors the `composed_reviews` row). */
export const ComposedReview = z.object({
  id: z.string(),
  pr_id: z.string(),
  body: z.string(),
  verdict: Verdict.nullable(),
  posted_at: z.string().nullable(),
  github_review_id: z.string().nullable(),
});
export type ComposedReview = z.infer<typeof ComposedReview>;

/** A preview (no GitHub side-effect) of what would be posted. */
export const ComposeReviewPreview = z.object({
  body: z.string(),
  verdict: Verdict,
  inline_comments: z.array(
    z.object({ path: z.string(), line: z.number().int(), body: z.string() }),
  ),
});
export type ComposeReviewPreview = z.infer<typeof ComposeReviewPreview>;

// ===========================================================================
// Export-to-CI + CI Runs
// ===========================================================================

export const CiTarget = z.enum(['gha', 'circle', 'jenkins', 'cli']);
export type CiTarget = z.infer<typeof CiTarget>;

/** One generated file in the CI bundle (path + editable contents). */
export const CiFile = z.object({
  path: z.string(),
  contents: z.string(),
  editable: z.boolean().default(true),
});
export type CiFile = z.infer<typeof CiFile>;

/** Request body for `POST /agents/:id/export-ci`. */
export const CiExportInput = z.object({
  repo: z.string().min(1), // "owner/name"
  target: CiTarget.default('gha'),
  /** "open_pr" opens a PR with the files; "files" just returns/persists them. */
  action: z.enum(['open_pr', 'files']).default('open_pr'),
  post_as: z.enum(['github_review', 'pr_comment', 'none']).default('github_review'),
  triggers: z.array(z.string()).default(['opened', 'synchronize', 'reopened']),
  base: z.string().default('main'),
});
export type CiExportInput = z.infer<typeof CiExportInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type CiExportInputBody = z.input<typeof CiExportInput>;

/** A persisted CI installation (mirrors `ci_installations`). */
export const CiInstallation = z.object({
  id: z.string(),
  agent_id: z.string(),
  repo: z.string(),
  target_type: CiTarget,
  installed_at: z.string(),
});
export type CiInstallation = z.infer<typeof CiInstallation>;

/** Response of `POST /agents/:id/export-ci`. */
export const CiExport = z.object({
  installation: CiInstallation,
  files: z.array(CiFile),
  pr_url: z.string().nullable(),
});
export type CiExport = z.infer<typeof CiExport>;

export const CiRunStatus = z.enum(['succeeded', 'failed', 'no_findings', 'running']);
export type CiRunStatus = z.infer<typeof CiRunStatus>;

/** A CI run row (mirrors `ci_runs`) — ingested from GitHub Actions artifacts. */
export const CiRun = z.object({
  id: z.string(),
  ci_installation_id: z.string().nullable(),
  pr_number: z.number().int().nullable(),
  ran_at: z.string().nullable(),
  status: z.string().nullable(),
  findings_count: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  github_url: z.string().nullable(),
  source: z.string().nullable(),
  agent: z.string().nullish(),
  duration_s: z.number().nullish(),
});
export type CiRun = z.infer<typeof CiRun>;

/**
 * The artifact shape uploaded by the CI action (`devdigest-result.json`).
 * Ingested back on refresh to populate `ci_runs` (L06).
 */
export const CiResultArtifact = z.object({
  findings_count: z.number().int(),
  critical: z.number().int().nullish(),
  warning: z.number().int().nullish(),
  suggestion: z.number().int().nullish(),
  cost_usd: z.number().nullable(),
  duration_ms: z.number().int().nullish(),
  agent: z.string(),
  version: z.string().nullish(),
  pr_number: z.number().int().nullish(),
});
export type CiResultArtifact = z.infer<typeof CiResultArtifact>;

// ===========================================================================
// Conformance (PRD ↔ PR) — API record (the analysis shape is `Conformance`)
// ===========================================================================

/** Request body for `POST /pulls/:id/conformance`. */
export const ConformanceInput = z.object({
  /** Spec path/id to compare against; if omitted, the first available spec. */
  spec: z.string().nullish(),
  provider: z.enum(['openai', 'anthropic']).nullish(),
  model: z.string().nullish(),
});
export type ConformanceInput = z.infer<typeof ConformanceInput>;

/** A persisted conformance check (mirrors `conformance_checks` + the report). */
export const ConformanceReport = z.object({
  id: z.string(),
  pr_id: z.string(),
  report: Conformance,
});
export type ConformanceReport = z.infer<typeof ConformanceReport>;

// ===========================================================================
// Hooks (Secret-Leak + Phantom-API detectors) — emit grounding-exempt findings
// ===========================================================================

export const HookKind = z.enum(['secret_leak', 'phantom']);
export type HookKind = z.infer<typeof HookKind>;

/** Result of running the built-in detectors over a PR. */
export const HookScanResult = z.object({
  pr_id: z.string(),
  review_id: z.string().nullable(),
  findings: z.array(Finding),
});
export type HookScanResult = z.infer<typeof HookScanResult>;
