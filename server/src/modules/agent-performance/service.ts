import type { AgentPerf, AgentStats } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { agentStats, aggregatePerformance, type PerfInput } from './domain/aggregate.js';
import { previousPeriod, resolvePeriod } from './domain/period.js';
import type { AgentPerformanceRepositoryPort } from './ports.js';
import type { PerfQuery } from './types.js';

export interface AgentPerformanceDeps {
  repo: AgentPerformanceRepositoryPort;
  now: () => Date;
}

/** Read-only use cases: no write, no LLM call. */
export class AgentPerformanceService {
  constructor(private deps: AgentPerformanceDeps) {}

  async performance(workspaceId: string, q: PerfQuery): Promise<AgentPerf> {
    const input = await this.load(workspaceId, q);
    return aggregatePerformance(input);
  }

  async stats(workspaceId: string, agentId: string, q: PerfQuery): Promise<AgentStats> {
    const input = await this.load(workspaceId, q, agentId);
    if (input.agents.length === 0) throw new NotFoundError('Agent not found');
    return agentStats(input, agentId);
  }

  private async load(workspaceId: string, q: PerfQuery, agentId?: string): Promise<PerfInput> {
    const period = resolvePeriod(q, this.deps.now());
    // Runs of the previous period feed the trend fields, so fetch both periods.
    const since = previousPeriod(period).from;
    const { repo } = this.deps;
    const [agents, runs, decisions] = await Promise.all([
      repo.listAgents(workspaceId, agentId),
      repo.listCountedRuns(workspaceId, since, period.to, agentId),
      repo.decisionsByRun(workspaceId, since, period.to, agentId),
    ]);
    return { period, agents, runs, decisions };
  }
}
