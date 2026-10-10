import type { EvalExpectationType } from "@devdigest/shared";

/** Codes of case routes that have an `eval.errors.*` message. */
export const CASE_ERROR_CODES = [
  "run_in_flight",
  "no_cases",
  "provider_key_missing",
  "too_many_cases",
  "finding_not_triaged",
  "expectation_outside_diff",
  "frozen_input_too_large",
  "agent_unavailable",
  "diff_unavailable",
  "decision_changed",
  "case_run_in_flight",
] as const;

export const EDITOR_WIDTH = 860;

export const EXPECTATION_TYPES: readonly EvalExpectationType[] = ["must_find", "must_not_flag"];

export type InputTab = "diff" | "files" | "prMeta";

/** "expected ≥ 1" / "expected 0" in the result banner (AC-102). */
export const EXPECTED_COUNT: Record<EvalExpectationType, string> = {
  must_find: "≥ 1",
  must_not_flag: "0",
};
