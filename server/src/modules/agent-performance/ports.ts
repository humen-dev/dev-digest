import type { PerfAgent, PerfRun, PerfRunDecisions } from './domain/aggregate.js';

/**
 * Read-only persistence port of the agent-performance module (application ring).
 * Every method is workspace-scoped; none writes. Plain domain types only.
 */
export interface AgentPerformanceRepositoryPort {
  /** All agents of the workspace (or just `agentId`, when given), including disabled ones. */
  listAgents(workspaceId: string, agentId?: string): Promise<PerfAgent[]>;
  /** Counted runs (done / failed / cancelled) with `ran_at` in the closed range [from, to]. */
  listCountedRuns(workspaceId: string, from: Date, to: Date, agentId?: string): Promise<PerfRun[]>;
  /** Finding decisions per run, for the same runs `listCountedRuns` returns. */
  decisionsByRun(workspaceId: string, from: Date, to: Date, agentId?: string): Promise<PerfRunDecisions[]>;
}
