import { z } from 'zod';

/**
 * Conformance, Eval, Memory, Conventions, Skills,
 * Agents and their DTOs.
 */

// ---- Conformance ----
export const ConformanceStatus = z.enum(['implemented', 'missing', 'out_of_scope']);
export type ConformanceStatus = z.infer<typeof ConformanceStatus>;

export const ConformanceItem = z.object({
  requirement: z.string(),
  status: ConformanceStatus,
  evidence_file: z.string().nullish(),
  notes: z.string().nullish(),
});
export type ConformanceItem = z.infer<typeof ConformanceItem>;

export const Conformance = z.object({
  spec_id: z.string(),
  spec_title: z.string(),
  items: z.array(ConformanceItem),
  completeness_pct: z.number().min(0).max(100),
});
export type Conformance = z.infer<typeof Conformance>;

// ---- Eval ----
export const EvalOwnerKind = z.enum(['skill', 'agent']);
export type EvalOwnerKind = z.infer<typeof EvalOwnerKind>;

export const EvalExpectationType = z.enum(['must_find', 'must_not_flag']);
export type EvalExpectationType = z.infer<typeof EvalExpectationType>;

export const EvalExpectation = z
  .object({
    type: EvalExpectationType,
    file: z.string().min(1),
    start_line: z.number().int().min(1),
    end_line: z.number().int().min(1),
  })
  .strict()
  .refine((e) => e.start_line <= e.end_line, {
    path: ['start_line'],
    message: 'start_line must be <= end_line',
  });
export type EvalExpectation = z.infer<typeof EvalExpectation>;

export const EvalCaseMeta = z.object({
  pr_id: z.string().nullable(),
  pr_number: z.number().int().nullable(),
  title: z.string(),
  body: z.string().nullable(),
});
export type EvalCaseMeta = z.infer<typeof EvalCaseMeta>;

export const EvalCase = z.object({
  id: z.string(),
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string(),
  notes: z.string().nullable(),
  input_diff: z.string(),
  input_files: z.array(z.string()),
  input_meta: EvalCaseMeta,
  expectation: EvalExpectation,
  source_finding_id: z.string().nullable(),
  severity: z.string().nullable(),
  category: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type EvalCase = z.infer<typeof EvalCase>;

export const EvalActualFinding = z.object({
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  severity: z.string(),
  category: z.string(),
  title: z.string(),
  rationale: z.string(),
  matched: z.boolean(),
});
export type EvalActualFinding = z.infer<typeof EvalActualFinding>;

export const EvalCaseOutcome = z.object({
  case_id: z.string(),
  name: z.string(),
  expectation_type: EvalExpectationType,
  status: z.enum(['scored', 'errored']),
  pass: z.boolean().nullable(),
  error_reason: z.string().nullable(),
  findings_total: z.number().int(),
  findings_matched: z.number().int(),
  grounding_kept: z.number().int(),
  grounding_total: z.number().int(),
  actual: z.array(EvalActualFinding),
  duration_ms: z.number().int(),
  cost_usd: z.number().nullable(),
});
export type EvalCaseOutcome = z.infer<typeof EvalCaseOutcome>;

const Ratio = z.number().min(0).max(1).nullable();

export const EvalRunMetrics = z.object({
  recall: Ratio,
  precision: Ratio,
  citation_accuracy: Ratio,
  cases_passed: z.number().int(),
  cases_total: z.number().int(),
  cases_errored: z.number().int(),
  uncovered_findings: z.number().int(),
});
export type EvalRunMetrics = z.infer<typeof EvalRunMetrics>;

export const EvalRun = EvalRunMetrics.extend({ per_case: z.array(EvalCaseOutcome) });
export type EvalRun = z.infer<typeof EvalRun>;

// ---- Memory ----
export const MemoryScope = z.enum(['repo', 'global', 'team']);
export type MemoryScope = z.infer<typeof MemoryScope>;

export const MemoryKind = z.enum([
  'decision',
  'convention',
  'preference',
  'fact',
  'learning',
]);
export type MemoryKind = z.infer<typeof MemoryKind>;

export const MemorySource = z.object({
  pr: z.number().int().nullish(),
  context: z.string(),
});
export type MemorySource = z.infer<typeof MemorySource>;

export const MemoryItem = z.object({
  content: z.string(),
  scope: MemoryScope,
  kind: MemoryKind,
  confidence: z.number().min(0).max(1),
  sources: z.array(MemorySource),
});
export type MemoryItem = z.infer<typeof MemoryItem>;

// ---- Skills ----
export const SkillType = z.enum(['rubric', 'convention', 'security', 'custom']);
export type SkillType = z.infer<typeof SkillType>;

export const SkillSource = z.enum([
  'manual',
  'imported_url',
  'imported_file',
  'extracted',
  'community',
]);
export type SkillSource = z.infer<typeof SkillSource>;

export const Skill = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: SkillType,
  source: SkillSource,
  body: z.string(),
  enabled: z.boolean(),
  version: z.number().int(),
  evidence_files: z.array(z.string()).nullish(),
  // Server-computed; not persisted on the row.
  body_tokens: z.number().int(),
  agent_count: z.number().int(),
  // Server-computed from `body`: a prompt-injection pattern was found. Such a skill is blocked (never enabled).
  injection_detected: z.boolean().optional(),
});
export type Skill = z.infer<typeof Skill>;

export const SkillVersion = z.object({
  skill_id: z.string(),
  version: z.number().int(),
  body: z.string(),
  /** Optional author note describing what changed — null for versions saved without one. */
  message: z.string().nullish(),
  created_at: z.string(),
});
export type SkillVersion = z.infer<typeof SkillVersion>;

export const SkillImportDraft = z.object({
  name: z.string(),
  description: z.string(),
  type: SkillType,
  body: z.string(),
});
export type SkillImportDraft = z.infer<typeof SkillImportDraft>;

export const SkillImportPreview = z.object({
  draft: SkillImportDraft,
  /** Archive entries the product deliberately did NOT process (scripts, binaries, nested .md). */
  ignored_entries: z.array(z.string()),
  warnings: z.array(z.string()),
});
export type SkillImportPreview = z.infer<typeof SkillImportPreview>;

export const CommunitySkill = z.object({
  name: z.string(),
  repo: z.string(),
  stars: z.number().int(),
  lang: z.string(),
  desc: z.string(),
});
export type CommunitySkill = z.infer<typeof CommunitySkill>;

// ---- Conventions ----
// House rules a repo already follows, extracted by one model call and verified
// by code against the sampled files (see server/specs/conventions.md).
export const ConventionCategory = z.enum([
  'naming',
  'structure',
  'imports',
  'error_handling',
  'typing',
  'testing',
  'api',
  'data_access',
  'style',
  'other',
]);
export type ConventionCategory = z.infer<typeof ConventionCategory>;

/** Triage state. A re-scan replaces only `pending` rows; decided rows persist. */
export const ConventionStatus = z.enum(['pending', 'accepted', 'rejected']);
export type ConventionStatus = z.infer<typeof ConventionStatus>;

export const ConventionCandidate = z.object({
  id: z.string(),
  repo_id: z.string(),
  rule: z.string(),
  rationale: z.string().nullable(),
  category: ConventionCategory,
  evidence_path: z.string(),
  /** 1-based first line of the snippet, as verified by code (not as claimed by the model). */
  evidence_line: z.number().int(),
  /** Re-read from the file — never the model's text. */
  evidence_snippet: z.string(),
  /** Distinct files matching the rule's literal (ripgrep); null = not measured. */
  occurrences: z.number().int().nullable(),
  confidence: z.number().min(0).max(1),
  status: ConventionStatus,
  created_at: z.string(),
});
export type ConventionCandidate = z.infer<typeof ConventionCandidate>;

export const ConventionScan = z.object({
  id: z.string(),
  created_at: z.string(),
  sampled_files: z.array(z.string()),
  proposed: z.number().int(),
  dropped_ungrounded: z.number().int(),
  dropped_duplicate: z.number().int(),
  dropped_rare: z.number().int(),
  kept: z.number().int(),
  model: z.string(),
  /** Real provider-reported cost only; null when the provider reports none. */
  api_cost_usd: z.number().nullable(),
  head_sha: z.string().nullable(),
  duration_ms: z.number().int(),
});
export type ConventionScan = z.infer<typeof ConventionScan>;

export const ConventionBoard = z.object({
  candidates: z.array(ConventionCandidate),
  last_scan: ConventionScan.nullable(),
});
export type ConventionBoard = z.infer<typeof ConventionBoard>;

/** Un-persisted skill assembled from accepted conventions; the user edits it before saving. */
export const ConventionSkillDraft = z.object({
  name: z.string(),
  description: z.string(),
  type: SkillType,
  enabled: z.boolean(),
  body: z.string(),
  body_tokens: z.number().int(),
  evidence_files: z.array(z.string()),
  convention_ids: z.array(z.string()),
});
export type ConventionSkillDraft = z.infer<typeof ConventionSkillDraft>;

// ---- Agents ----
export const Provider = z.enum(['openai', 'anthropic', 'openrouter']);
export type Provider = z.infer<typeof Provider>;

// Review execution strategy (matches @devdigest/reviewer-core's ReviewStrategy):
//  - single-pass: send the WHOLE diff in ONE model call (default)
//  - map-reduce:  one model call PER changed file (for very large diffs)
//  - auto:        single-pass, switching to map-reduce when the diff is large
export const ReviewStrategy = z.enum(['single-pass', 'map-reduce', 'auto']);
export type ReviewStrategy = z.infer<typeof ReviewStrategy>;

// CI gate policy — when a CI review should BLOCK (REQUEST_CHANGES + fail the
// check) vs just comment. Deterministic from severities; acted on ONLY in CI.
export const CiFailOn = z.enum(['never', 'critical', 'warning', 'any']);
export type CiFailOn = z.infer<typeof CiFailOn>;

export const Agent = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  enabled: z.boolean(),
  version: z.number().int(),
  strategy: ReviewStrategy.default('single-pass'),
  ci_fail_on: CiFailOn.default('critical'),
  // Inject repo-intel context (repo skeleton + callers + rank note) into this
  // agent's review prompt. Default on; gated again by the global flag.
  repo_intel: z.boolean().default(true),
});
export type Agent = z.infer<typeof Agent>;

export const AgentSkillLink = z.object({
  agent_id: z.string(),
  skill_id: z.string(),
  order: z.number().int(),
});
export type AgentSkillLink = z.infer<typeof AgentSkillLink>;
