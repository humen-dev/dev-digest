import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { COUNTED_STATUSES } from './constants.js';
import type { PerfAgent, PerfRun, PerfRunDecisions } from './domain/aggregate.js';
import type { AgentPerformanceRepositoryPort } from './ports.js';

/**
 * Drizzle implementation of `AgentPerformanceRepositoryPort`. Read-only: three
 * workspace-scoped queries over `agents`, `agent_runs` and `reviews`/`findings`.
 * Never selects `agent_runs.error`.
 */
export class DrizzleAgentPerformanceRepository implements AgentPerformanceRepositoryPort {
  constructor(private db: Db) {}

  async listAgents(workspaceId: string, agentId?: string): Promise<PerfAgent[]> {
    const rows = await this.db
      .select({ id: t.agents.id, name: t.agents.name, enabled: t.agents.enabled })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), agentId ? eq(t.agents.id, agentId) : undefined))
      .orderBy(asc(t.agents.name), asc(t.agents.id));
    return rows;
  }

  async listCountedRuns(workspaceId: string, from: Date, to: Date, agentId?: string): Promise<PerfRun[]> {
    const rows = await this.db
      .select({
        id: t.agentRuns.id,
        agentId: t.agentRuns.agentId,
        ranAt: t.agentRuns.ranAt,
        status: t.agentRuns.status,
        source: t.agentRuns.source,
        model: t.agentRuns.model,
        durationMs: t.agentRuns.durationMs,
        costUsd: t.agentRuns.costUsd,
      })
      .from(t.agentRuns)
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          gte(t.agentRuns.ranAt, from),
          lte(t.agentRuns.ranAt, to),
          inArray(t.agentRuns.status, [...COUNTED_STATUSES]),
          agentId ? eq(t.agentRuns.agentId, agentId) : undefined,
        ),
      );
    return rows.map((r) => ({ ...r, status: r.status ?? '' }));
  }

  async decisionsByRun(workspaceId: string, from: Date, to: Date, agentId?: string): Promise<PerfRunDecisions[]> {
    const accepted = sql<number>`count(*) filter (where ${t.findings.acceptedAt} is not null)::int`;
    const dismissed = sql<number>`count(*) filter (where ${t.findings.acceptedAt} is null and ${t.findings.dismissedAt} is not null)::int`;
    const pending = sql<number>`count(*) filter (where ${t.findings.acceptedAt} is null and ${t.findings.dismissedAt} is null)::int`;
    const rows = await this.db
      .select({ runId: t.agentRuns.id, accepted, dismissed, pending })
      .from(t.agentRuns)
      .innerJoin(t.reviews, eq(t.reviews.runId, t.agentRuns.id))
      .innerJoin(t.findings, eq(t.findings.reviewId, t.reviews.id))
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          eq(t.reviews.workspaceId, workspaceId),
          gte(t.agentRuns.ranAt, from),
          lte(t.agentRuns.ranAt, to),
          inArray(t.agentRuns.status, [...COUNTED_STATUSES]),
          agentId ? eq(t.agentRuns.agentId, agentId) : undefined,
        ),
      )
      .groupBy(t.agentRuns.id);
    return rows;
  }
}
