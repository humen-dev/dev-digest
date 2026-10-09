import type { EvalAgentSummary } from "@devdigest/shared";
import { RUN_ERROR_CODES } from "./constants";

/** Sum of `cases_total` over agents — the "executions" figure of the Run all confirmation (AC-66). */
export function totalExecutions(agents: readonly EvalAgentSummary[]): number {
  return agents.reduce((sum, a) => sum + a.cases_total, 0);
}

/** Maps a refusal reason to an `eval.errors.*` key; anything unknown reads `generic`. */
export function refusalKey(reason: string | null | undefined): (typeof RUN_ERROR_CODES)[number] | "generic" {
  return (RUN_ERROR_CODES as readonly string[]).includes(reason ?? "")
    ? (reason as (typeof RUN_ERROR_CODES)[number])
    : "generic";
}
