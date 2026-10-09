/** Recent runs shown on the dashboard (AC-64). */
export const RECENT_RUNS_LIMIT = 20;

/** Refusal codes that have an `eval.errors.*` message. */
export const RUN_ERROR_CODES = [
  "run_in_flight",
  "no_cases",
  "provider_key_missing",
  "too_many_cases",
] as const;

export const AGENT_GRID_COLUMNS = "minmax(0,2fr) 110px 120px 100px 70px 70px 70px 64px";

export const SPARKLINE_COLOR = "var(--accent)";
