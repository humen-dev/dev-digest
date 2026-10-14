import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { FindingRecord } from '@devdigest/shared';
import { findingRowToDto } from '../helpers.js';
import { getPull } from './pull.repo.js';
import type { RunsCursor } from '../domain/runs-cursor.js';
import type {
  LinkedRunInput,
  MultiAgentRepositoryPort,
  MultiRunAgentRecord,
  MultiRunColumnRecord,
  MultiRunListRecord,
  MultiRunRecord,
  MultiRunRefRecord,
  PullSummary,
} from '../ports.js';

/**
 * SPEC-07 — data access of the multi-agent run. Owns `multi_agent_runs`; the
 * linked `agent_runs` rows are created here (with `multi_run_id`) and updated by
 * the run repository as before. Every read is workspace-scoped, directly or
 * through the PR.
 */
export class MultiAgentRepository implements MultiAgentRepositoryPort {
  constructor(private db: Db) {}

  async getPull(workspaceId: string, prId: string): Promise<PullSummary | undefined> {
    const row = await getPull(this.db, workspaceId, prId);
    return row ? { id: row.id, number: row.number, title: row.title } : undefined;
  }

  async findInFlight(prId: string): Promise<{ multiRunId: string } | undefined> {
    const [row] = await this.db
      .select({ multiRunId: t.agentRuns.multiRunId })
      .from(t.agentRuns)
      .where(
        and(eq(t.agentRuns.prId, prId), eq(t.agentRuns.status, 'running'), isNotNull(t.agentRuns.multiRunId)),
      )
      .limit(1);
    return row?.multiRunId ? { multiRunId: row.multiRunId } : undefined;
  }

  async createMultiRunWithRuns(
    workspaceId: string,
    prId: string,
    runs: Omit<LinkedRunInput, 'workspaceId' | 'prId' | 'multiRunId'>[],
  ): Promise<{ multiRun: MultiRunRecord; runIds: string[] }> {
    return this.db.transaction(async (tx) => {
      const [multiRun] = await tx
        .insert(t.multiAgentRuns)
        .values({ workspaceId, prId })
        .returning({ id: t.multiAgentRuns.id, prId: t.multiAgentRuns.prId, ranAt: t.multiAgentRuns.ranAt });
      const runIds: string[] = [];
      for (const run of runs) {
        const [row] = await tx
          .insert(t.agentRuns)
          .values({
            workspaceId,
            agentId: run.agentId,
            prId,
            provider: run.provider,
            model: run.model,
            status: 'running',
            source: 'local',
            multiRunId: multiRun!.id,
          })
          .returning({ id: t.agentRuns.id });
        runIds.push(row!.id);
      }
      return { multiRun: multiRun!, runIds };
    });
  }

  async getRun(workspaceId: string, multiRunId: string): Promise<MultiRunRecord | undefined> {
    const [row] = await this.db
      .select({ id: t.multiAgentRuns.id, prId: t.multiAgentRuns.prId, ranAt: t.multiAgentRuns.ranAt })
      .from(t.multiAgentRuns)
      .where(and(eq(t.multiAgentRuns.workspaceId, workspaceId), eq(t.multiAgentRuns.id, multiRunId)));
    return row;
  }

  async latestRunForPr(workspaceId: string, prId: string): Promise<MultiRunRecord | undefined> {
    const [row] = await this.db
      .select({ id: t.multiAgentRuns.id, prId: t.multiAgentRuns.prId, ranAt: t.multiAgentRuns.ranAt })
      .from(t.multiAgentRuns)
      .where(and(eq(t.multiAgentRuns.workspaceId, workspaceId), eq(t.multiAgentRuns.prId, prId)))
      .orderBy(desc(t.multiAgentRuns.ranAt), desc(t.multiAgentRuns.id))
      .limit(1);
    return row;
  }

  async latestRunForWorkspace(workspaceId: string): Promise<MultiRunRefRecord | undefined> {
    const [row] = await this.db
      .select({ id: t.multiAgentRuns.id, prId: t.multiAgentRuns.prId, prNumber: t.pullRequests.number })
      .from(t.multiAgentRuns)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.multiAgentRuns.prId))
      .where(eq(t.multiAgentRuns.workspaceId, workspaceId))
      .orderBy(desc(t.multiAgentRuns.ranAt), desc(t.multiAgentRuns.id))
      .limit(1);
    return row;
  }

  async listRunsPage(workspaceId: string, after: RunsCursor | null, take: number): Promise<MultiRunListRecord[]> {
    const ranAt = t.multiAgentRuns.ranAt;
    // Strict keyset on (ran_at, id). ran_at has µs precision, so the cursor value is a
    // µs-exact UTC text bound as a parameter (never sql.raw) and cast back to timestamptz.
    const keyset = after
      ? sql`(${ranAt}, ${t.multiAgentRuns.id}) < (${after.ranAt}::timestamptz, ${after.id}::uuid)`
      : undefined;
    return this.db
      .select({
        id: t.multiAgentRuns.id,
        prId: t.multiAgentRuns.prId,
        prNumber: t.pullRequests.number,
        prTitle: t.pullRequests.title,
        repoName: t.repos.fullName,
        ranAt,
        ranAtCursor: sql<string>`to_char(${ranAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      })
      .from(t.multiAgentRuns)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.multiAgentRuns.prId))
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(and(eq(t.multiAgentRuns.workspaceId, workspaceId), keyset))
      .orderBy(desc(ranAt), desc(t.multiAgentRuns.id))
      .limit(take);
  }

  async agentRunsOf(multiRunIds: string[]): Promise<MultiRunAgentRecord[]> {
    if (multiRunIds.length === 0) return [];
    const rows = await this.db
      .select({
        multiRunId: t.agentRuns.multiRunId,
        agentName: t.agents.name,
        status: t.agentRuns.status,
        finishedAt: t.agentRuns.finishedAt,
        costUsd: t.agentRuns.costUsd,
      })
      .from(t.agentRuns)
      .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
      .where(inArray(t.agentRuns.multiRunId, multiRunIds))
      .orderBy(asc(t.agentRuns.ranAt), asc(t.agentRuns.id));
    return rows.flatMap((r) => (r.multiRunId ? [{ ...r, multiRunId: r.multiRunId }] : []));
  }

  async columns(multiRunId: string): Promise<MultiRunColumnRecord[]> {
    const runs = await this.db
      .select({ run: t.agentRuns, agent: t.agents, review: t.reviews })
      .from(t.agentRuns)
      .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
      .leftJoin(t.reviews, and(eq(t.reviews.runId, t.agentRuns.id), eq(t.reviews.kind, 'review')))
      .where(eq(t.agentRuns.multiRunId, multiRunId))
      .orderBy(asc(t.agentRuns.ranAt), asc(t.agentRuns.id), asc(t.reviews.createdAt));

    // One review per run (first wins if a run somehow has several).
    const seen = new Set<string>();
    const unique = runs.filter((r) => (seen.has(r.run.id) ? false : (seen.add(r.run.id), true)));

    const reviewIds = unique.flatMap((r) => (r.review ? [r.review.id] : []));
    const findingRows =
      reviewIds.length > 0
        ? await this.db.select().from(t.findings).where(inArray(t.findings.reviewId, reviewIds))
        : [];
    const byReview = new Map<string, FindingRecord[]>();
    for (const row of findingRows) {
      const list = byReview.get(row.reviewId) ?? [];
      list.push(findingRowToDto(row));
      byReview.set(row.reviewId, list);
    }

    return unique.map(({ run, agent, review }) => ({
      runId: run.id,
      agentId: run.agentId,
      agentName: agent?.name ?? null,
      agentDescription: agent?.description ?? null,
      provider: run.provider,
      model: run.model,
      status: run.status,
      error: run.error,
      durationMs: run.durationMs,
      costUsd: run.costUsd,
      score: run.score,
      ranAt: run.ranAt,
      finishedAt: run.finishedAt,
      verdict: review?.verdict ?? null,
      summary: review?.summary ?? null,
      reviewScore: review?.score ?? null,
      findings: review ? (byReview.get(review.id) ?? []) : [],
    }));
  }
}
