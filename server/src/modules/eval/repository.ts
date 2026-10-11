import { and, asc, count, desc, eq, getTableColumns, inArray, lt, lte, sql } from 'drizzle-orm';
import type { EvalCase, EvalCaseOutcome, EvalRunDetail, EvalRunRecord } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { toEvalCase, toRunDetail, toRunRecord } from './mappers.js';
import type {
  AgentSnapshot,
  EvalRepositoryPort,
  FindingSource,
  NewCase,
  NewRun,
  RunResult,
} from './ports.js';

const { perCase: _perCase, ...runListColumns } = getTableColumns(t.evalRuns);

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === '23505' || e?.cause?.code === '23505';
}

/**
 * Drizzle implementation of `EvalRepositoryPort`. Owns `eval_cases` and
 * `eval_runs` (the only tables it writes); `findings`, `reviews`,
 * `pull_requests`, `agents`, `agent_versions`, `agent_skills` and `skills` are
 * read-only joins. Every query is workspace-scoped; returns contract shapes.
 */
export class EvalRepository implements EvalRepositoryPort {
  constructor(private db: Db) {}

  async findingSource(ws: string, findingId: string): Promise<FindingSource | null> {
    const [row] = await this.db
      .select({ f: t.findings, agentId: t.reviews.agentId, pr: t.pullRequests })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
      .innerJoin(t.pullRequests, eq(t.reviews.prId, t.pullRequests.id))
      .where(
        and(
          eq(t.findings.id, findingId),
          eq(t.reviews.workspaceId, ws),
          eq(t.pullRequests.workspaceId, ws),
        ),
      );
    if (!row) return null;
    return {
      finding_id: row.f.id,
      file: row.f.file,
      start_line: row.f.startLine,
      end_line: row.f.endLine,
      title: row.f.title,
      severity: row.f.severity,
      category: row.f.category,
      accepted_at: row.f.acceptedAt ? row.f.acceptedAt.toISOString() : null,
      dismissed_at: row.f.dismissedAt ? row.f.dismissedAt.toISOString() : null,
      agent_id: row.agentId,
      pr_id: row.pr.id,
      pr_number: row.pr.number,
      pr_title: row.pr.title,
      pr_body: row.pr.body,
    };
  }

  async findingLink(ws: string, findingId: string): Promise<{ repo_id: string; pr_number: number } | null> {
    const [row] = await this.db
      .select({ repoId: t.pullRequests.repoId, number: t.pullRequests.number })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
      .innerJoin(t.pullRequests, eq(t.reviews.prId, t.pullRequests.id))
      .where(
        and(
          eq(t.findings.id, findingId),
          eq(t.reviews.workspaceId, ws),
          eq(t.pullRequests.workspaceId, ws),
        ),
      );
    return row ? { repo_id: row.repoId, pr_number: row.number } : null;
  }

  async caseBySourceFinding(ws: string, findingId: string): Promise<EvalCase | null> {
    const [row] = await this.db
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, ws), eq(t.evalCases.sourceFindingId, findingId)));
    return row ? toEvalCase(row) : null;
  }

  async caseNames(ws: string, agentId: string): Promise<string[]> {
    const rows = await this.db
      .select({ name: t.evalCases.name })
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, ws), eq(t.evalCases.ownerId, agentId)));
    return rows.map((r) => r.name);
  }

  async insertCase(c: NewCase): Promise<{ case: EvalCase; created: boolean }> {
    const [inserted] = await this.db
      .insert(t.evalCases)
      .values({
        workspaceId: c.workspace_id,
        ownerKind: 'agent',
        ownerId: c.owner_id,
        name: c.name,
        notes: c.notes,
        inputDiff: c.input_diff,
        inputFiles: c.input_files,
        inputMeta: c.input_meta,
        expectedOutput: c.expectation,
        sourceFindingId: c.source_finding_id,
        severity: c.severity,
        category: c.category,
      })
      .onConflictDoNothing({ target: [t.evalCases.workspaceId, t.evalCases.sourceFindingId] })
      .returning();
    if (inserted) return { case: toEvalCase(inserted), created: true };

    // Lost the race for (workspace, source finding): return the winner's row.
    const existing = c.source_finding_id ? await this.caseBySourceFinding(c.workspace_id, c.source_finding_id) : null;
    if (!existing) throw new Error('eval case insert conflicted but no existing row was found');
    return { case: existing, created: false };
  }

  async getCase(ws: string, id: string): Promise<EvalCase | null> {
    const [row] = await this.db
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, ws), eq(t.evalCases.id, id)));
    return row ? toEvalCase(row) : null;
  }

  async listCases(ws: string, agentId: string): Promise<EvalCase[]> {
    const rows = await this.db
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, ws), eq(t.evalCases.ownerId, agentId)))
      .orderBy(asc(t.evalCases.createdAt), asc(t.evalCases.id));
    return rows.map(toEvalCase);
  }

  async countCases(ws: string, agentId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, ws), eq(t.evalCases.ownerId, agentId)));
    return row?.n ?? 0;
  }

  async updateCase(ws: string, id: string, patch: Partial<NewCase>): Promise<EvalCase | null> {
    const set: Partial<typeof t.evalCases.$inferInsert> = { updatedAt: new Date() };
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.notes !== undefined) set.notes = patch.notes;
    if (patch.input_diff !== undefined) set.inputDiff = patch.input_diff;
    if (patch.input_files !== undefined) set.inputFiles = patch.input_files;
    if (patch.input_meta !== undefined) set.inputMeta = patch.input_meta;
    if (patch.expectation !== undefined) set.expectedOutput = patch.expectation;
    if (patch.severity !== undefined) set.severity = patch.severity;
    if (patch.category !== undefined) set.category = patch.category;
    const [row] = await this.db
      .update(t.evalCases)
      .set(set)
      .where(and(eq(t.evalCases.workspaceId, ws), eq(t.evalCases.id, id)))
      .returning();
    return row ? toEvalCase(row) : null;
  }

  async deleteCase(ws: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, ws), eq(t.evalCases.id, id)))
      .returning({ id: t.evalCases.id });
    return rows.length > 0;
  }

  async agentSnapshot(ws: string, agentId: string): Promise<AgentSnapshot | null> {
    const [agent] = await this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.id, agentId), eq(t.agents.workspaceId, ws)));
    if (!agent) return null;
    const links = await this.db
      .select({ skill: t.skills, order: t.agentSkills.order })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(and(eq(t.agentSkills.agentId, agentId), eq(t.skills.workspaceId, ws)))
      .orderBy(asc(t.agentSkills.order), asc(t.skills.name));
    return {
      agent_id: agent.id,
      name: agent.name,
      provider: agent.provider,
      model: agent.model,
      system_prompt: agent.systemPrompt,
      strategy: agent.strategy,
      version: agent.version,
      skills: links.map(({ skill }) => ({
        skill_id: skill.id,
        name: skill.name,
        type: skill.type,
        body: skill.body,
        enabled: skill.enabled,
        version: skill.version,
      })),
    };
  }

  async agentSystemPrompt(agentId: string, version: number): Promise<string | null> {
    const [row] = await this.db
      .select({ cfg: t.agentVersions.configJson })
      .from(t.agentVersions)
      .where(and(eq(t.agentVersions.agentId, agentId), eq(t.agentVersions.version, version)));
    const prompt = (row?.cfg as { system_prompt?: unknown } | null | undefined)?.system_prompt;
    return typeof prompt === 'string' ? prompt : null;
  }

  async agentsWithCases(
    ws: string,
  ): Promise<{ agent_id: string; name: string; model: string; cases_total: number }[]> {
    const rows = await this.db
      .select({ id: t.agents.id, name: t.agents.name, model: t.agents.model, n: count(t.evalCases.id) })
      .from(t.agents)
      .innerJoin(t.evalCases, and(eq(t.evalCases.ownerId, t.agents.id), eq(t.evalCases.workspaceId, ws)))
      .where(eq(t.agents.workspaceId, ws))
      .groupBy(t.agents.id, t.agents.name, t.agents.model)
      .orderBy(asc(t.agents.name), asc(t.agents.id));
    return rows.map((r) => ({ agent_id: r.id, name: r.name, model: r.model, cases_total: r.n }));
  }

  async reconcileStale(cutoff: Date, ws?: string): Promise<number> {
    const conds = [eq(t.evalRuns.status, 'running'), lt(t.evalRuns.heartbeatAt, cutoff)];
    if (ws) conds.push(eq(t.evalRuns.workspaceId, ws));
    const rows = await this.db
      .update(t.evalRuns)
      .set({ status: 'errored', errorReason: 'interrupted', finishedAt: new Date() })
      .where(and(...conds))
      .returning({ id: t.evalRuns.id });
    return rows.length;
  }

  async runningRun(ws: string, agentId: string): Promise<EvalRunRecord | null> {
    const [row] = await this.db
      .select({ run: runListColumns, agentName: t.agents.name })
      .from(t.evalRuns)
      .leftJoin(t.agents, eq(t.evalRuns.ownerId, t.agents.id))
      .where(
        and(eq(t.evalRuns.workspaceId, ws), eq(t.evalRuns.ownerId, agentId), eq(t.evalRuns.status, 'running')),
      );
    return row ? toRunRecord(row.run, row.agentName) : null;
  }

  async insertRun(r: NewRun): Promise<string | null> {
    try {
      const [row] = await this.db
        .insert(t.evalRuns)
        .values({
          workspaceId: r.workspace_id,
          ownerKind: 'agent',
          ownerId: r.owner_id,
          status: 'running',
          agentVersion: r.agent_version,
          skillsFingerprint: r.skills_fingerprint,
          caseIds: r.case_ids,
        })
        .returning({ id: t.evalRuns.id });
      return row?.id ?? null;
    } catch (err) {
      // eval_runs_one_running_uq: another run of this agent is already in flight (AC-25).
      if (isUniqueViolation(err)) return null;
      throw err;
    }
  }

  async runExists(id: string): Promise<boolean> {
    const [row] = await this.db.select({ id: t.evalRuns.id }).from(t.evalRuns).where(eq(t.evalRuns.id, id));
    return !!row;
  }

  async heartbeat(id: string): Promise<void> {
    await this.db
      .update(t.evalRuns)
      .set({ heartbeatAt: new Date() })
      .where(and(eq(t.evalRuns.id, id), eq(t.evalRuns.status, 'running')));
  }

  async completeRun(id: string, r: RunResult): Promise<void> {
    const now = new Date();
    await this.db
      .update(t.evalRuns)
      .set({
        status: 'completed',
        recall: r.metrics.recall,
        precision: r.metrics.precision,
        citationAccuracy: r.metrics.citation_accuracy,
        casesPassed: r.metrics.cases_passed,
        casesTotal: r.metrics.cases_total,
        casesErrored: r.metrics.cases_errored,
        uncoveredFindings: r.metrics.uncovered_findings,
        perCase: r.per_case,
        durationMs: r.duration_ms,
        costUsd: r.cost_usd,
        finishedAt: now,
        heartbeatAt: now,
      })
      .where(and(eq(t.evalRuns.id, id), eq(t.evalRuns.status, 'running')));
  }

  async failRun(id: string, reason: string): Promise<void> {
    await this.db
      .update(t.evalRuns)
      .set({ status: 'errored', errorReason: reason, finishedAt: new Date() })
      .where(and(eq(t.evalRuns.id, id), eq(t.evalRuns.status, 'running')));
  }

  async getRun(ws: string, id: string): Promise<EvalRunDetail | null> {
    const [row] = await this.db
      .select({ run: t.evalRuns, agentName: t.agents.name })
      .from(t.evalRuns)
      .leftJoin(t.agents, eq(t.evalRuns.ownerId, t.agents.id))
      .where(and(eq(t.evalRuns.workspaceId, ws), eq(t.evalRuns.id, id)));
    return row ? toRunDetail(row.run, row.agentName) : null;
  }

  async listRuns(ws: string, agentId: string, limit?: number): Promise<EvalRunRecord[]> {
    const q = this.db
      .select({ run: runListColumns, agentName: t.agents.name })
      .from(t.evalRuns)
      .leftJoin(t.agents, eq(t.evalRuns.ownerId, t.agents.id))
      .where(and(eq(t.evalRuns.workspaceId, ws), eq(t.evalRuns.ownerId, agentId)))
      .orderBy(desc(t.evalRuns.ranAt), desc(t.evalRuns.id));
    const rows = await (limit === undefined ? q : q.limit(limit));
    return rows.map((r) => toRunRecord(r.run, r.agentName));
  }

  async latestCompletedRuns(ws: string, agentIds: string[], limitPerAgent: number): Promise<EvalRunRecord[]> {
    if (agentIds.length === 0 || limitPerAgent <= 0) return [];
    const rn = sql<number>`row_number() over (partition by ${t.evalRuns.ownerId} order by ${t.evalRuns.ranAt} desc, ${t.evalRuns.id} desc)`.as('rn');
    const ranked = this.db
      .select({ id: t.evalRuns.id, rn })
      .from(t.evalRuns)
      .where(
        and(
          eq(t.evalRuns.workspaceId, ws),
          inArray(t.evalRuns.ownerId, agentIds),
          eq(t.evalRuns.status, 'completed'),
        ),
      )
      .as('ranked');
    const rows = await this.db
      .select({ run: runListColumns, agentName: t.agents.name })
      .from(ranked)
      .innerJoin(t.evalRuns, eq(t.evalRuns.id, ranked.id))
      .leftJoin(t.agents, eq(t.evalRuns.ownerId, t.agents.id))
      .where(lte(ranked.rn, limitPerAgent))
      .orderBy(asc(t.evalRuns.ownerId), desc(t.evalRuns.ranAt), desc(t.evalRuns.id));
    return rows.map((r) => toRunRecord(r.run, r.agentName));
  }

  async recentRuns(ws: string, limit: number): Promise<EvalRunRecord[]> {
    const rows = await this.db
      .select({ run: runListColumns, agentName: t.agents.name })
      .from(t.evalRuns)
      .leftJoin(t.agents, eq(t.evalRuns.ownerId, t.agents.id))
      .where(eq(t.evalRuns.workspaceId, ws))
      .orderBy(desc(t.evalRuns.ranAt), desc(t.evalRuns.id))
      .limit(limit);
    return rows.map((r) => toRunRecord(r.run, r.agentName));
  }

  async completedOutcomes(
    ws: string,
    agentId: string,
    limit: number,
  ): Promise<{ run_id: string; per_case: EvalCaseOutcome[] }[]> {
    const rows = await this.db
      .select({ id: t.evalRuns.id, perCase: t.evalRuns.perCase })
      .from(t.evalRuns)
      .where(
        and(
          eq(t.evalRuns.workspaceId, ws),
          eq(t.evalRuns.ownerId, agentId),
          eq(t.evalRuns.status, 'completed'),
        ),
      )
      .orderBy(desc(t.evalRuns.ranAt), desc(t.evalRuns.id))
      .limit(limit);
    return rows.map((r) => ({ run_id: r.id, per_case: r.perCase as EvalCaseOutcome[] }));
  }
}
