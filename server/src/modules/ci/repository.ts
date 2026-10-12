import { and, asc, desc, eq, getTableColumns, gte, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import type { CiInstallationState, CiRunStatus, CiRunSummary, CiRunsPage, CiRunsQuery, Verdict } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { toCiRun, toInstallationRecord } from './mappers.js';
import type {
  CiInstallationRecord,
  CiRepository,
  NewCiRunInput,
  UpsertInstallationInput,
} from './ports.js';

/**
 * Drizzle implementation of `CiRepository`. Owns `ci_installations` and
 * `ci_runs` (the only tables it writes). `memory`, `agents` are read-only
 * reads. Every query is workspace-scoped and returns contract / record shapes.
 */
export class DrizzleCiRepository implements CiRepository {
  constructor(private db: Db) {}

  async findInstallationByRepo(ws: string, repo: string): Promise<CiInstallationRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(t.ciInstallations)
      .where(and(eq(t.ciInstallations.workspaceId, ws), eq(t.ciInstallations.repo, repo)));
    return row ? toInstallationRecord(row) : undefined;
  }

  async listInstallations(ws: string, agentId?: string): Promise<CiInstallationRecord[]> {
    const rows = await this.db
      .select()
      .from(t.ciInstallations)
      .where(
        and(
          eq(t.ciInstallations.workspaceId, ws),
          agentId ? eq(t.ciInstallations.agentId, agentId) : undefined,
        ),
      )
      .orderBy(asc(t.ciInstallations.repo));
    return rows.map(toInstallationRecord);
  }

  async upsertInstallation(
    i: UpsertInstallationInput,
  ): Promise<{ record: CiInstallationRecord; created: boolean }> {
    const [row] = await this.db
      .insert(t.ciInstallations)
      .values({
        workspaceId: i.workspaceId,
        agentId: i.agentId,
        repo: i.repo,
        targetType: i.targetType,
        githubRepoId: i.githubRepoId,
        manifestSlug: i.manifestSlug,
        triggers: i.triggers,
        postAs: i.postAs,
        workflowVersion: i.workflowVersion,
        generatorVersion: i.generatorVersion,
        agentVersion: i.agentVersion,
        exportedCiFailOn: i.exportedCiFailOn,
        prUrl: i.prUrl,
        state: i.state,
      })
      .onConflictDoUpdate({
        target: [t.ciInstallations.workspaceId, t.ciInstallations.repo],
        set: {
          agentId: i.agentId,
          githubRepoId: i.githubRepoId,
          // AC-86 — the slug fixed at first export survives every re-export.
          manifestSlug: sql`coalesce(${t.ciInstallations.manifestSlug}, ${i.manifestSlug})`,
          triggers: i.triggers,
          postAs: i.postAs,
          workflowVersion: i.workflowVersion,
          generatorVersion: i.generatorVersion,
          agentVersion: i.agentVersion,
          exportedCiFailOn: i.exportedCiFailOn,
          prUrl: i.prUrl,
          state: i.state,
          updatedAt: new Date(),
        },
      })
      .returning({ ...getTableColumns(t.ciInstallations), inserted: sql<boolean>`(xmax = 0)` });
    const { inserted, ...installation } = row!;
    return { record: toInstallationRecord(installation), created: inserted };
  }

  async setInstallationState(id: string, state: CiInstallationState): Promise<void> {
    await this.db.update(t.ciInstallations).set({ state }).where(eq(t.ciInstallations.id, id));
  }

  async touchRefreshed(id: string, at: Date): Promise<void> {
    await this.db.update(t.ciInstallations).set({ lastRefreshedAt: at }).where(eq(t.ciInstallations.id, id));
  }

  async memoryForRepo(ws: string, repoId: string): Promise<{ kind: string; content: string }[]> {
    return this.db
      .select({ kind: t.memory.kind, content: t.memory.content })
      .from(t.memory)
      .where(and(eq(t.memory.workspaceId, ws), eq(t.memory.repoId, repoId), eq(t.memory.scope, 'repo')))
      .orderBy(asc(t.memory.createdAt), asc(t.memory.id));
  }

  async hasRun(ws: string, providerRunId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.ciRuns.id })
      .from(t.ciRuns)
      .where(and(eq(t.ciRuns.workspaceId, ws), eq(t.ciRuns.providerRunId, providerRunId)))
      .limit(1);
    return !!row;
  }

  async claimRun(i: NewCiRunInput): Promise<string | null> {
    const [row] = await this.db
      .insert(t.ciRuns)
      .values({
        workspaceId: i.workspaceId,
        ciInstallationId: i.ciInstallationId,
        agentId: i.agentId,
        repo: i.repo,
        providerRunId: i.providerRunId,
        prNumber: i.prNumber,
        prTitle: i.prTitle,
        prUrl: i.prUrl,
        commitSha: i.commitSha,
        agentName: i.agentName,
        ranAt: i.ranAt,
        status: i.status,
        findingsCount: i.findingsCount,
        critical: i.critical,
        warning: i.warning,
        suggestion: i.suggestion,
        verdict: i.verdict,
        blockers: i.blockers,
        costUsd: i.costUsd,
        durationMs: i.durationMs,
        githubUrl: i.jobUrl,
        source: 'gha',
        failureReason: i.failureReason,
        ingestedAt: i.ingestedAt,
      })
      .onConflictDoNothing({ target: [t.ciRuns.workspaceId, t.ciRuns.providerRunId] })
      .returning({ id: t.ciRuns.id });
    return row?.id ?? null;
  }

  async linkAgentRun(ciRunId: string, agentRunId: string): Promise<void> {
    await this.db.update(t.ciRuns).set({ agentRunId }).where(eq(t.ciRuns.id, ciRunId));
  }

  async listRuns(ws: string, q: CiRunsQuery): Promise<CiRunsPage> {
    const readable = and(eq(t.ciRuns.workspaceId, ws), isNotNull(t.ciRuns.providerRunId));
    const rows = await this.db
      .select()
      .from(t.ciRuns)
      .where(
        and(
          readable,
          q.from ? gte(t.ciRuns.ranAt, new Date(q.from)) : undefined,
          q.to ? lte(t.ciRuns.ranAt, new Date(q.to)) : undefined,
          q.agent_id ? eq(t.ciRuns.agentId, q.agent_id) : undefined,
          q.repo ? eq(t.ciRuns.repo, q.repo) : undefined,
          q.status ? eq(t.ciRuns.status, q.status) : undefined,
          q.source ? eq(t.ciRuns.source, q.source) : undefined,
        ),
      )
      .orderBy(desc(t.ciRuns.ranAt), desc(t.ciRuns.id))
      .limit(q.limit);

    // Filter vocabularies cover every stored run, not only the filtered page.
    const agents = await this.db
      .selectDistinct({ id: t.agents.id, name: t.agents.name })
      .from(t.ciRuns)
      .innerJoin(t.agents, eq(t.ciRuns.agentId, t.agents.id))
      .where(readable)
      .orderBy(asc(t.agents.name));
    const repoRows = await this.db
      .selectDistinct({ repo: t.ciRuns.repo })
      .from(t.ciRuns)
      .where(and(readable, isNotNull(t.ciRuns.repo)))
      .orderBy(asc(t.ciRuns.repo));

    return {
      runs: rows.map(toCiRun),
      agents,
      repos: repoRows.map((r) => r.repo!),
    };
  }

  async lastRuns(ws: string, installationIds: string[]): Promise<Map<string, CiRunSummary>> {
    const out = new Map<string, CiRunSummary>();
    if (installationIds.length === 0) return out;
    const rows = await this.db
      .selectDistinctOn([t.ciRuns.ciInstallationId], {
        installationId: t.ciRuns.ciInstallationId,
        status: t.ciRuns.status,
        verdict: t.ciRuns.verdict,
        ranAt: t.ciRuns.ranAt,
        ingestedAt: t.ciRuns.ingestedAt,
      })
      .from(t.ciRuns)
      .where(
        and(
          eq(t.ciRuns.workspaceId, ws),
          isNotNull(t.ciRuns.providerRunId),
          inArray(t.ciRuns.ciInstallationId, installationIds),
        ),
      )
      .orderBy(t.ciRuns.ciInstallationId, desc(t.ciRuns.ranAt));
    for (const r of rows) {
      if (!r.installationId) continue;
      out.set(r.installationId, {
        status: (r.status ?? 'failed') as CiRunStatus,
        verdict: r.verdict as Verdict | null,
        ran_at: (r.ranAt ?? r.ingestedAt ?? new Date(0)).toISOString(),
      });
    }
    return out;
  }

  async agentNames(ws: string): Promise<{ id: string; name: string }[]> {
    return this.db
      .select({ id: t.agents.id, name: t.agents.name })
      .from(t.agents)
      .where(eq(t.agents.workspaceId, ws))
      .orderBy(asc(t.agents.name));
  }
}
