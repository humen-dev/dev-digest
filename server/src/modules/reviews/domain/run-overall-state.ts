import type { AgentRunStatus, MultiAgentOverallState } from '@devdigest/shared';

/**
 * Overall state of a multi-agent run from its agent-run statuses (pure).
 *   running — any agent run is running
 *   done    — every one is done (an empty set is done)
 *   failed  — otherwise; failedCount = failed + cancelled runs
 */
export function deriveOverallState(statuses: AgentRunStatus[]): {
  state: MultiAgentOverallState;
  failedCount: number;
} {
  const failedCount = statuses.filter((s) => s === 'failed' || s === 'cancelled').length;
  if (statuses.some((s) => s === 'running')) return { state: 'running', failedCount };
  if (statuses.every((s) => s === 'done')) return { state: 'done', failedCount };
  return { state: 'failed', failedCount };
}
