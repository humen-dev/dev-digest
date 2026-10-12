import type {
  AgentColumn,
  AgentRunStatus,
  MultiAgentRun,
  MultiAgentRunRef,
  MultiAgentRunsListItem,
  MultiAgentRunsPage,
  MultiAgentRunTriggerResult,
} from '@devdigest/shared';
import { AppError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { decodeRunsCursor, encodeRunsCursor } from './domain/runs-cursor.js';
import { deriveOverallState } from './domain/run-overall-state.js';
import { buildMatchGroups, type GroupInputRun } from './domain/match-groups.js';
import { computeTotals } from './domain/multi-agent-totals.js';
import { maskColumnError } from './domain/column-error.js';
import type {
  BatchLogger,
  MultiAgentAgentsPort,
  MultiAgentBatchPort,
  MultiAgentRepositoryPort,
  MultiRunAgentRecord,
  MultiRunColumnRecord,
} from './ports.js';

const UNKNOWN_AGENT_NAME = 'Unknown agent';

export interface MultiAgentDeps {
  repo: MultiAgentRepositoryPort;
  agents: MultiAgentAgentsPort;
  batch: MultiAgentBatchPort;
}

/** Stored status text → contract status (a null/unknown value reads as still running). */
function toRunStatus(status: string | null): AgentRunStatus {
  return status === 'done' || status === 'failed' || status === 'cancelled' ? status : 'running';
}

/**
 * SPEC-07 — multi-agent review use case. Triggers N agents on one PR as one
 * batch and reads the batch back (columns + match groups + totals). Groups and
 * totals are computed on read from persisted rows; a read never calls an LLM.
 */
export class MultiAgentService {
  constructor(private deps: MultiAgentDeps) {}

  async trigger(
    workspaceId: string,
    prId: string,
    agentIds: string[],
    logger?: BatchLogger,
  ): Promise<MultiAgentRunTriggerResult> {
    const { repo, agents, batch } = this.deps;
    const pull = await repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    // Dedupe, then resolve EVERY agent inside the workspace before creating anything.
    const uniqueIds = [...new Set(agentIds)];
    const resolved = [];
    for (const id of uniqueIds) {
      const agent = await agents.getById(workspaceId, id);
      if (!agent) throw new NotFoundError('Agent not found');
      resolved.push(agent);
    }

    const inFlight = await repo.findInFlight(prId);
    if (inFlight) {
      throw new AppError('multi_run_in_flight', 'A multi-agent run is already in flight for this pull request', 409, {
        multi_run_id: inFlight.multiRunId,
      });
    }

    // One transaction: the multi-run and all its agent runs, or nothing.
    const { multiRun, runIds } = await repo.createMultiRunWithRuns(
      workspaceId,
      prId,
      resolved.map((a) => ({ agentId: a.id, provider: a.provider, model: a.model })),
    );
    const targets: MultiAgentRunTriggerResult['targets'] = resolved.map((agent, i) => ({
      run_id: runIds[i]!,
      agent_id: agent.id,
      agent_name: agent.name,
    }));

    await batch.start(
      workspaceId,
      prId,
      targets.map((t) => ({ agentId: t.agent_id, runId: t.run_id })),
      logger,
    );
    return { id: multiRun.id, pr_id: prId, targets };
  }

  async read(workspaceId: string, prId: string, multiRunId?: string): Promise<MultiAgentRun> {
    const { repo } = this.deps;
    const pull = await repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const run = multiRunId ? await repo.getRun(workspaceId, multiRunId) : await repo.latestRunForPr(workspaceId, prId);
    if (!run || run.prId !== prId) throw new NotFoundError('Multi-agent run not found');

    const records = await repo.columns(run.id);

    const groupInput: GroupInputRun[] = records.map((r) => ({
      runId: r.runId,
      agentId: r.agentId,
      agentName: r.agentName ?? UNKNOWN_AGENT_NAME,
      agentDescription: r.agentDescription ?? '',
      status: toRunStatus(r.status),
      findings: r.findings.map((f) => ({
        id: f.id,
        severity: f.severity,
        title: f.title,
        file: f.file,
        startLine: f.start_line,
        endLine: f.end_line,
      })),
    }));
    const conflicts = buildMatchGroups(groupInput);

    const groupOfFinding = new Map<string, string>();
    for (const g of conflicts) for (const id of g.finding_ids) groupOfFinding.set(id, g.id);

    const columns = records.map((r) => toColumn(r, groupOfFinding));
    const totals = computeTotals({
      createdAt: run.ranAt,
      now: new Date(),
      runs: records.map((r) => ({ status: toRunStatus(r.status), finishedAt: r.finishedAt, costUsd: r.costUsd })),
    });

    return {
      id: run.id,
      pr_id: prId,
      pr_number: pull.number,
      pr_title: pull.title,
      ran_at: run.ranAt.toISOString(),
      agent_count: columns.length,
      total_duration_ms: totals.totalDurationMs,
      total_cost_usd: totals.totalCostUsd,
      unpriced_count: totals.unpricedCount,
      columns,
      conflicts,
    };
  }

  /**
   * Keyset page of the workspace's multi-runs, newest first. Two SQL reads, no
   * findings and no LLM; totals use the same inputs as `read()`.
   */
  async list(workspaceId: string, cursor: string | undefined, limit: number): Promise<MultiAgentRunsPage> {
    const { repo } = this.deps;
    const after = cursor === undefined ? null : decodeRunsCursor(cursor);
    if (cursor !== undefined && !after) throw new ValidationError('Invalid cursor');

    const fetched = await repo.listRunsPage(workspaceId, after, limit + 1);
    const hasMore = fetched.length > limit;
    const page = fetched.slice(0, limit);

    const agentRuns = await repo.agentRunsOf(page.map((r) => r.id));
    const byRun = new Map<string, MultiRunAgentRecord[]>();
    for (const a of agentRuns) {
      const list = byRun.get(a.multiRunId) ?? [];
      list.push(a);
      byRun.set(a.multiRunId, list);
    }

    const now = new Date();
    const items: MultiAgentRunsListItem[] = page.map((run) => {
      const runs = (byRun.get(run.id) ?? []).map((a) => ({
        name: a.agentName ?? UNKNOWN_AGENT_NAME,
        status: toRunStatus(a.status),
        finishedAt: a.finishedAt,
        costUsd: a.costUsd,
      }));
      const { state, failedCount } = deriveOverallState(runs.map((r) => r.status));
      const totals = computeTotals({ createdAt: run.ranAt, now, runs });
      return {
        id: run.id,
        pr_id: run.prId,
        pr_number: run.prNumber,
        pr_title: run.prTitle,
        repo_name: run.repoName,
        ran_at: run.ranAt.toISOString(),
        state,
        failed_count: failedCount,
        agent_count: runs.length,
        total_duration_ms: totals.totalDurationMs,
        total_cost_usd: totals.totalCostUsd,
        unpriced_count: totals.unpricedCount,
        agents: runs.map((r) => ({ agent_name: r.name, status: r.status })),
      };
    });

    const last = hasMore ? page[page.length - 1] : undefined;
    return {
      items,
      next_cursor: last ? encodeRunsCursor({ ranAt: last.ranAtCursor, id: last.id }) : null,
    };
  }

  /** Newest multi-run of a PR, or null (404 only when the PR itself is unknown). */
  async latestForPr(workspaceId: string, prId: string): Promise<MultiAgentRunRef | null> {
    const { repo } = this.deps;
    const pull = await repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const run = await repo.latestRunForPr(workspaceId, prId);
    return run ? { id: run.id, pr_id: prId, pr_number: pull.number } : null;
  }

  /** Newest multi-run of the workspace, or null. */
  async latest(workspaceId: string): Promise<MultiAgentRunRef | null> {
    const ref = await this.deps.repo.latestRunForWorkspace(workspaceId);
    return ref ? { id: ref.id, pr_id: ref.prId, pr_number: ref.prNumber } : null;
  }
}

function toColumn(r: MultiRunColumnRecord, groupOfFinding: Map<string, string>): AgentColumn {
  return {
    run_id: r.runId,
    agent_id: r.agentId,
    agent_name: r.agentName ?? UNKNOWN_AGENT_NAME,
    agent_description: r.agentDescription ?? '',
    provider: r.provider,
    model: r.model,
    status: toRunStatus(r.status),
    error: maskColumnError(r.error),
    verdict: r.verdict,
    score: r.reviewScore ?? r.score,
    summary: r.summary,
    duration_ms: r.durationMs,
    cost_usd: r.costUsd,
    findings: r.findings.map((f) => ({ ...f, group_id: groupOfFinding.get(f.id) ?? `${f.file}#${f.start_line}` })),
  };
}
