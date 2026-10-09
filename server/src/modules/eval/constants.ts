export const EVAL_CASE_DEADLINE_MS = 120_000;
export const EVAL_MAX_REPAIR_RETRIES = 1;
export const EVAL_STALE_RUN_MS = 15 * 60_000;
export const EVAL_MAX_CASES = 50;
export const EVAL_MAX_FROZEN_DIFF_BYTES = 204_800;
export const EVAL_RECENT_RUNS = 20;
export const EVAL_NAME_MAX = 120;
/** Applied per route: `POST /agents/:id/eval-runs` and `POST /eval-runs/all` each get their own 5/min bucket. */
export const EVAL_RUN_RATE_LIMIT = { max: 5, timeWindow: '1 minute' } as const;
export const EVAL_TASK_LINE = 'Review the changes in this eval case diff.';
