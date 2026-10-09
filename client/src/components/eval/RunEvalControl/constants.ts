/** Codes of POST /agents/:id/eval-runs (and a run's `error_reason`) that have an `eval.errors.*` message. */
export const RUN_ERROR_CODES = [
  "run_in_flight",
  "no_cases",
  "provider_key_missing",
  "too_many_cases",
] as const;

export type RunErrorCode = (typeof RUN_ERROR_CODES)[number];
