/** Error codes of POST /findings/:id/eval-case that have an `eval.errors.*` message (plan §3.4). */
export const FINDING_ERROR_CODES = [
  "finding_not_triaged",
  "expectation_outside_diff",
  "frozen_input_too_large",
  "agent_unavailable",
  "diff_unavailable",
] as const;

export type FindingErrorCode = (typeof FINDING_ERROR_CODES)[number];
