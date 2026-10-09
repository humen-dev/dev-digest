import type { EvalAgentSummary } from "@devdigest/shared";

/** Sum of `cases_total` over agents — the "executions" figure of the Run all confirmation (AC-66). */
export function totalExecutions(agents: readonly EvalAgentSummary[]): number {
  return agents.reduce((sum, a) => sum + a.cases_total, 0);
}
