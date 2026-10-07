/** PR Brief (SPEC-04) limits and identifiers. */

/** Closed `Risk.kind` vocabulary; unknown model kinds map to `other`. */
export const RISK_KINDS = [
  'auth_surface',
  'dependency',
  'performance',
  'data_migration',
  'api_contract',
  'config_secrets',
  'test_coverage',
  'other',
] as const;

/** Whole initial request (system prompt + payload), counted by the server tokenizer. */
export const PROMPT_TOKEN_BUDGET = 8_000;
export const MAX_OUTPUT_TOKENS = 1_500;

/** One deadline across all attempts of the single structured call. */
export const GENERATION_DEADLINE_MS = 90_000;
export const STRUCTURED_MAX_RETRIES = 1;
export const MIN_ATTEMPT_TIMEOUT_MS = 1_000;

export const MAX_RISKS = 6;
export const MAX_FOCUS_ITEMS = 5;

export const PR_BODY_MAX_CHARS = 4_000;
export const ISSUE_BODY_MAX_CHARS = 4_000;

/** Budget drop thresholds — items beyond these go first. */
export const BUDGET_TOP_CALLERS = 20;
export const BUDGET_TOP_ENDPOINTS = 20;
export const BUDGET_TOP_CHANGED_FILES = 40;

/** Top-level dirs whose docs are "general" (always preselected). */
export const GENERAL_DOC_DIRS = ['specs', 'docs', 'insights'] as const;

export const BRIEF_DRAFT_SCHEMA_NAME = 'pr_brief_draft';
