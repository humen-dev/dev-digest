export const EVAL_CASE_DEADLINE_MS = 120_000;
export const EVAL_MAX_REPAIR_RETRIES = 1;
export const EVAL_STALE_RUN_MS = 15 * 60_000;
export const EVAL_MAX_CASES = 50;
export const EVAL_MAX_FROZEN_DIFF_BYTES = 204_800;
export const EVAL_RECENT_RUNS = 20;
/** Upper bound on the agent detail run list (newest first). */
export const EVAL_AGENT_RUNS_MAX = 100;
/** Above this many LCS table cells the prompt diff falls back to a coarse remove-all/add-all. */
export const EVAL_PROMPT_DIFF_MAX_CELLS = 4_000_000;
/** Stored as `error_reason` for a run failure that is not an expected, user-safe error. */
export const EVAL_INTERNAL_ERROR_REASON = 'internal_error';
/**
 * The complete set of per-case `error_reason` values. Raw provider / SDK / engine
 * messages are never stored (they can echo prompts, keys or URLs).
 */
export const EVAL_CASE_REASON = {
  timeout: 'timeout',
  providerError: 'provider_error',
  invalidOutput: 'invalid_output',
  error: 'error',
} as const;
export const EVAL_NAME_MAX = 120;
/** Applied per route: `POST /agents/:id/eval-runs` and `POST /eval-runs/all` each get their own 5/min bucket. */
export const EVAL_RUN_RATE_LIMIT = { max: 5, timeWindow: '1 minute' } as const;
/** Run case (dry run) gets its own per-route bucket, separate from the suite-start limit (SPEC-06 AC-97). */
export const EVAL_CASE_RUN_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const;
export const EVAL_TASK_LINE = 'Review the changes in this eval case diff.';
