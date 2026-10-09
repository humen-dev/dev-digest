import type {
  EvalAgentDetail,
  EvalCase,
  EvalCaseDetail,
  EvalCaseInput,
  EvalCaseListItem,
  EvalCaseOutcome,
  EvalCasePatch,
  EvalCompare,
  EvalDashboard,
  EvalExpectation,
  EvalRunAllResult,
  EvalRunDetail,
  EvalRunEstimate,
  EvalRunRecord,
  EvalRunStarted,
  EvalTrendPoint,
} from '@devdigest/shared';
import { AppError, ConfigError, NotFoundError } from '../../platform/errors.js';
import { maskSecretsForStorage } from '../_shared/secrets.js';
import { renderSkillBlocks } from '../_shared/skill-render.js';
import {
  EVAL_AGENT_RUNS_MAX,
  EVAL_INTERNAL_ERROR_REASON,
  EVAL_MAX_CASES,
  EVAL_MAX_FROZEN_DIFF_BYTES,
  EVAL_RECENT_RUNS,
  EVAL_STALE_RUN_MS,
} from './constants.js';
import { buildBanner } from './domain/banner.js';
import { compareRuns, markSkillsDelta } from './domain/compare.js';
import { diffByteSize, expectationIntersectsHunk, extractFileDiff } from './domain/frozen-input.js';
import { caseNameFromTitle } from './domain/naming.js';
import { erroredOutcome, runCost, scoreCase, scoreRun } from './domain/scoring.js';
import { fingerprint, promptSkills } from './domain/skills.js';
import { EvalCaseError, runCase } from './executor.js';
import type {
  AgentSnapshot,
  DiffParser,
  EvalLog,
  EvalRepositoryPort,
  FindingSource,
  LlmResolver,
  PrDiffSource,
} from './ports.js';
import type { CreatedFromFinding, EvalErrorCode } from './types.js';

export interface EvalDeps {
  repo: EvalRepositoryPort;
  diffs: PrDiffSource;
  parser: DiffParser;
  llm: LlmResolver;
  /** Clock override for tests. */
  now?: () => number;
}

function unprocessable(code: EvalErrorCode, message: string, details?: unknown): AppError {
  return new AppError(code, message, 422, details);
}

const laterOf = (a: string | null, b: string | null): 'accepted' | 'dismissed' | null => {
  if (a && b) return Date.parse(a) >= Date.parse(b) ? 'accepted' : 'dismissed';
  return a ? 'accepted' : b ? 'dismissed' : null;
};

function caseStatus(o: EvalCaseOutcome): 'pass' | 'fail' | 'errored' {
  return o.status === 'errored' ? 'errored' : o.pass ? 'pass' : 'fail';
}

function trendOf(completedNewestFirst: readonly EvalRunRecord[]): EvalTrendPoint[] {
  const points: EvalTrendPoint[] = [];
  for (const r of completedNewestFirst.slice(0, EVAL_RECENT_RUNS)) {
    if (!r.metrics) continue;
    points.push({
      run_id: r.id,
      ran_at: r.started_at,
      agent_version: r.agent_version,
      recall: r.metrics.recall,
      precision: r.metrics.precision,
      citation_accuracy: r.metrics.citation_accuracy,
      cases_passed: r.metrics.cases_passed,
      cases_total: r.metrics.cases_total,
    });
  }
  return points.reverse(); // oldest first, for charts
}

/** Everything a started run needs, resolved once at start (AC-18). */
interface RunPlan {
  runId: string;
  snapshot: AgentSnapshot;
  skillBlocks: string[];
  cases: EvalCase[];
  llm: Awaited<ReturnType<LlmResolver>>;
}

/**
 * Eval use cases (SPEC-05): freezing findings into cases, running an agent over
 * its case set in the background, and the read paths over stored runs. Read
 * paths never resolve an LLM provider (AC-33).
 */
export class EvalService {
  private pending = new Set<Promise<void>>();

  constructor(private deps: EvalDeps) {}

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }

  /** Resolves when every background run started so far has finished (tests, graceful shutdown). */
  async idle(): Promise<void> {
    while (this.pending.size > 0) await Promise.all([...this.pending]);
  }

  // ---------- cases ----------

  /** Freezes one triaged finding into a case for the agent that produced it. */
  async createFromFinding(ws: string, findingId: string): Promise<CreatedFromFinding> {
    const { repo } = this.deps;
    const src = await repo.findingSource(ws, findingId);
    if (!src) throw new NotFoundError('Finding not found');

    const existing = await repo.caseBySourceFinding(ws, findingId);
    if (existing) return { case: existing, created: false };

    const kind = laterOf(src.accepted_at, src.dismissed_at);
    if (!kind) throw unprocessable('finding_not_triaged', 'Accept or dismiss the finding first');
    if (!src.agent_id || !(await repo.agentSnapshot(ws, src.agent_id))) {
      throw unprocessable('agent_unavailable', 'The agent that produced this finding no longer exists');
    }

    const fileDiff = await this.fileDiffOf(ws, src);
    const diff = maskSecretsForStorage(fileDiff);
    const title = maskSecretsForStorage(src.pr_title);
    const body = src.pr_body == null ? null : maskSecretsForStorage(src.pr_body);
    const expectation: EvalExpectation = {
      type: kind === 'accepted' ? 'must_find' : 'must_not_flag',
      file: src.file,
      start_line: src.start_line,
      end_line: src.end_line,
    };
    const files = this.validateFrozen(diff, expectation);

    const name = maskSecretsForStorage(
      caseNameFromTitle(maskSecretsForStorage(src.title), src.finding_id, await repo.caseNames(ws, src.agent_id)),
    );
    return repo.insertCase({
      workspace_id: ws,
      owner_id: src.agent_id,
      name,
      notes: null,
      input_diff: diff,
      input_files: files,
      input_meta: { pr_id: src.pr_id, pr_number: src.pr_number, title, body },
      expectation,
      source_finding_id: src.finding_id,
      severity: src.severity,
      category: src.category,
    });
  }

  /** Manual create: the same masking, size and hunk rules as edit (I-5). */
  async createManual(ws: string, agentId: string, input: EvalCaseInput): Promise<EvalCase> {
    const { repo } = this.deps;
    if (!(await repo.agentSnapshot(ws, agentId))) throw new NotFoundError('Agent not found');
    const diff = maskSecretsForStorage(input.input_diff);
    const files = this.validateFrozen(diff, input.expectation);
    const { case: created } = await repo.insertCase({
      workspace_id: ws,
      owner_id: agentId,
      name: maskSecretsForStorage(input.name),
      notes: input.notes == null ? null : maskSecretsForStorage(input.notes),
      input_diff: diff,
      input_files: files,
      input_meta: {
        pr_id: null,
        pr_number: null,
        title: maskSecretsForStorage(input.pr_title),
        body: input.pr_body == null ? null : maskSecretsForStorage(input.pr_body),
      },
      expectation: input.expectation,
      source_finding_id: null,
      severity: null,
      category: null,
    });
    return created;
  }

  /** Edits a case only; stored runs are never touched (AC-43). */
  async patchCase(ws: string, id: string, patch: EvalCasePatch): Promise<EvalCase> {
    const { repo } = this.deps;
    const current = await repo.getCase(ws, id);
    if (!current) throw new NotFoundError('Eval case not found');

    const update: Parameters<EvalRepositoryPort['updateCase']>[2] = {};
    if (patch.name !== undefined) update.name = maskSecretsForStorage(patch.name);
    if (patch.notes !== undefined) update.notes = patch.notes === null ? null : maskSecretsForStorage(patch.notes);
    if (patch.pr_title !== undefined || patch.pr_body !== undefined) {
      update.input_meta = {
        ...current.input_meta,
        ...(patch.pr_title !== undefined ? { title: maskSecretsForStorage(patch.pr_title) } : {}),
        ...(patch.pr_body !== undefined
          ? { body: patch.pr_body === null ? null : maskSecretsForStorage(patch.pr_body) }
          : {}),
      };
    }
    if (patch.input_diff !== undefined || patch.expectation !== undefined) {
      const diff = patch.input_diff !== undefined ? maskSecretsForStorage(patch.input_diff) : current.input_diff;
      const expectation = patch.expectation ?? current.expectation;
      update.input_files = this.validateFrozen(diff, expectation);
      if (patch.input_diff !== undefined) update.input_diff = diff;
      if (patch.expectation !== undefined) update.expectation = expectation;
    }
    const saved = await repo.updateCase(ws, id, update);
    if (!saved) throw new NotFoundError('Eval case not found');
    return saved;
  }

  async deleteCase(ws: string, id: string): Promise<void> {
    if (!(await this.deps.repo.deleteCase(ws, id))) throw new NotFoundError('Eval case not found');
  }

  async listCases(ws: string, agentId: string): Promise<EvalCaseListItem[]> {
    const { repo } = this.deps;
    await this.requireAgent(ws, agentId);
    const [cases, history] = await Promise.all([
      repo.listCases(ws, agentId),
      repo.completedOutcomes(ws, agentId, EVAL_RECENT_RUNS),
    ]);
    return cases.map((c) => {
      for (const run of history) {
        const o = run.per_case.find((x) => x.case_id === c.id);
        if (o) {
          return {
            ...c,
            last: {
              run_id: run.run_id,
              status: caseStatus(o),
              findings_matched: o.status === 'scored' ? o.findings_matched : null,
            },
          };
        }
      }
      return { ...c, last: null };
    });
  }

  async getCaseDetail(ws: string, id: string): Promise<EvalCaseDetail> {
    const { repo } = this.deps;
    const c = await repo.getCase(ws, id);
    if (!c) throw new NotFoundError('Eval case not found');
    const link = c.source_finding_id ? await repo.findingLink(ws, c.source_finding_id) : null;
    const history = await repo.completedOutcomes(ws, c.owner_id, EVAL_RECENT_RUNS);
    let lastOutcome: EvalCaseDetail['last_outcome'] = null;
    for (const run of history) {
      const o = run.per_case.find((x) => x.case_id === c.id);
      if (o) {
        lastOutcome = { run_id: run.run_id, outcome: o };
        break;
      }
    }
    return {
      ...c,
      source: link,
      source_deleted: c.source_finding_id != null && link == null,
      last_outcome: lastOutcome,
    };
  }

  // ---------- runs ----------

  async estimate(ws: string, agentId: string): Promise<EvalRunEstimate> {
    await this.requireAgent(ws, agentId);
    return { agent_id: agentId, cases_total: await this.deps.repo.countCases(ws, agentId) };
  }

  /** Validates, snapshots and records a run, then executes it in the background; returns before case 1 starts. */
  async startRun(ws: string, agentId: string, log: EvalLog): Promise<EvalRunStarted> {
    const { repo } = this.deps;
    const snapshot = await this.requireAgent(ws, agentId);

    await repo.reconcileStale(new Date(this.now() - EVAL_STALE_RUN_MS), ws);
    const running = await repo.runningRun(ws, agentId);
    if (running) {
      throw new AppError('run_in_flight', 'A run is already in progress for this agent', 409, { run_id: running.id });
    }

    const total = await repo.countCases(ws, agentId);
    if (total === 0) throw unprocessable('no_cases', 'This agent has no eval cases');
    if (total > EVAL_MAX_CASES) {
      throw unprocessable('too_many_cases', `Too many cases: ${total} (the limit is ${EVAL_MAX_CASES})`, {
        count: total,
        limit: EVAL_MAX_CASES,
      });
    }

    let llm: RunPlan['llm'];
    try {
      llm = await this.deps.llm(snapshot.provider);
    } catch (err) {
      if (err instanceof ConfigError) {
        throw unprocessable('provider_key_missing', `No API key is configured for ${snapshot.provider}`, {
          provider: snapshot.provider,
        });
      }
      throw err;
    }

    const cases = await repo.listCases(ws, agentId);
    if (cases.length === 0) throw unprocessable('no_cases', 'This agent has no eval cases');
    if (cases.length > EVAL_MAX_CASES) {
      throw unprocessable('too_many_cases', `Too many cases: ${cases.length} (the limit is ${EVAL_MAX_CASES})`, {
        count: cases.length,
        limit: EVAL_MAX_CASES,
      });
    }

    const sent = promptSkills(snapshot.skills);
    const runId = await repo.insertRun({
      workspace_id: ws,
      owner_id: agentId,
      agent_version: snapshot.version,
      skills_fingerprint: fingerprint(sent),
      case_ids: cases.map((c) => c.id),
    });
    if (!runId) throw new AppError('run_in_flight', 'A run is already in progress for this agent', 409);

    const plan: RunPlan = {
      runId,
      snapshot,
      skillBlocks: renderSkillBlocks(sent.map((skill) => ({ skill }))),
      cases,
      llm,
    };
    const task = this.execute(plan, log);
    this.pending.add(task);
    void task.finally(() => this.pending.delete(task));
    return { run_id: runId, status: 'running' };
  }

  /** One run per agent that has cases; refusals carry the AppError code (AC-67). */
  async runAll(ws: string, log: EvalLog): Promise<EvalRunAllResult> {
    const agents = await this.deps.repo.agentsWithCases(ws);
    const results: EvalRunAllResult['results'] = [];
    for (const a of agents) {
      try {
        const started = await this.startRun(ws, a.agent_id, log);
        results.push({ agent_id: a.agent_id, agent_name: a.name, outcome: 'started', run_id: started.run_id, reason: null, details: null });
      } catch (err) {
        if (!(err instanceof AppError)) log.error({ agent_id: a.agent_id }, 'eval run-all start failed');
        const reason = err instanceof AppError ? err.code : 'internal_error';
        const d = err instanceof AppError ? err.details : null;
        const details = d && typeof d === 'object' && !Array.isArray(d) ? (d as Record<string, unknown>) : null;
        results.push({ agent_id: a.agent_id, agent_name: a.name, outcome: 'refused', run_id: null, reason, details });
      }
    }
    return { results };
  }

  /** On API startup: runs whose last heartbeat is older than the stale window become `errored` (AC-29). */
  async reconcileOnBoot(log: EvalLog): Promise<number> {
    const n = await this.deps.repo.reconcileStale(new Date(this.now() - EVAL_STALE_RUN_MS));
    if (n > 0) log.info({ runs: n }, 'eval runs reconciled as interrupted');
    return n;
  }

  /** Processes the planned cases one at a time. Never rejects: a failure outside a case errors the run (AC-24). */
  private async execute(plan: RunPlan, log: EvalLog): Promise<void> {
    const { repo, parser } = this.deps;
    const { runId, snapshot, cases } = plan;
    const started = Date.now();
    const outcomes: EvalCaseOutcome[] = [];
    try {
      for (const c of cases) {
        // EC-9: the run row disappears when its agent is deleted — stop before the next engine call.
        if (!(await repo.runExists(runId))) {
          log.info({ run_id: runId, agent_id: snapshot.agent_id }, 'eval run stopped: run removed');
          return;
        }
        const t0 = Date.now();
        try {
          const exec = await runCase({
            snapshot,
            skillBlocks: plan.skillBlocks,
            evalCase: c,
            llm: plan.llm,
            parser,
          });
          outcomes.push(scoreCase(c, exec));
        } catch (err) {
          const reason = err instanceof EvalCaseError ? err.reason : 'error';
          outcomes.push(erroredOutcome(c, reason, Date.now() - t0));
        }
        await repo.heartbeat(runId);
      }
      const metrics = scoreRun(outcomes);
      const duration = Date.now() - started;
      const cost = runCost(outcomes);
      await repo.completeRun(runId, { metrics, per_case: outcomes, duration_ms: duration, cost_usd: cost });
      // NFR-7: ids, counts, metrics, model, duration and cost only.
      log.info(
        {
          run_id: runId,
          agent_id: snapshot.agent_id,
          agent_version: snapshot.version,
          model: snapshot.model,
          metrics,
          duration_ms: duration,
          cost_usd: cost,
        },
        'eval run completed',
      );
    } catch (err) {
      // Raw messages may carry provider/DB internals; the stored reason is fixed, the log keeps err.name.
      const reason = err instanceof AppError ? err.code : EVAL_INTERNAL_ERROR_REASON;
      try {
        await repo.failRun(runId, reason);
      } catch {
        /* the stale-run reconcile will close it */
      }
      log.error(
        { run_id: runId, agent_id: snapshot.agent_id, error: err instanceof Error ? err.name : 'unknown' },
        'eval run failed',
      );
    }
  }

  // ---------- read paths (never touch an LLM) ----------

  async listRuns(ws: string, agentId: string): Promise<EvalRunRecord[]> {
    await this.requireAgent(ws, agentId);
    return markSkillsDelta(await this.deps.repo.listRuns(ws, agentId, EVAL_AGENT_RUNS_MAX));
  }

  async getRun(ws: string, id: string): Promise<EvalRunDetail> {
    const run = await this.deps.repo.getRun(ws, id);
    if (!run) throw new NotFoundError('Eval run not found');
    return run;
  }

  async compare(ws: string, a: string, b: string): Promise<EvalCompare> {
    const { repo } = this.deps;
    if (a === b) throw unprocessable('invalid_compare_pair', 'Select two different runs of the same agent');
    const [ra, rb] = await Promise.all([repo.getRun(ws, a), repo.getRun(ws, b)]);
    if (!ra || !rb) throw new NotFoundError('Eval run not found');
    if (ra.agent_id !== rb.agent_id) {
      throw unprocessable('invalid_compare_pair', 'Select two different runs of the same agent');
    }
    const aFirst = Date.parse(ra.started_at) <= Date.parse(rb.started_at);
    const [older, newer] = aFirst ? [ra, rb] : [rb, ra];
    // The runs' workspace is established above, so the agent-scoped prompt lookups are safe.
    const [pOlder, pNewer] = await Promise.all([
      repo.agentSystemPrompt(older.agent_id, older.agent_version),
      repo.agentSystemPrompt(newer.agent_id, newer.agent_version),
    ]);
    return compareRuns(older, newer, { older: pOlder, newer: pNewer });
  }

  async dashboard(ws: string): Promise<EvalDashboard> {
    const { repo } = this.deps;
    const agents = await repo.agentsWithCases(ws);
    // One bounded round trip: one extra run so the oldest trend point still gets a correct `skills_delta`.
    const fetched = await repo.latestCompletedRuns(
      ws,
      agents.map((a) => a.agent_id),
      EVAL_RECENT_RUNS + 1,
    );
    const byAgent = new Map<string, EvalRunRecord[]>();
    for (const r of fetched) byAgent.set(r.agent_id, [...(byAgent.get(r.agent_id) ?? []), r]);
    const summaries = await Promise.all(
      agents.map(async (a) => {
        const completed = markSkillsDelta(byAgent.get(a.agent_id) ?? []);
        return {
          agent_id: a.agent_id,
          agent_name: a.name,
          model: a.model,
          cases_total: a.cases_total,
          latest: completed[0] ?? null,
          trend: trendOf(completed),
        };
      }),
    );
    return { agents: summaries, recent_runs: await repo.recentRuns(ws, EVAL_RECENT_RUNS) };
  }

  async agentDetail(ws: string, agentId: string): Promise<EvalAgentDetail> {
    const { repo } = this.deps;
    const agent = await this.requireAgent(ws, agentId);
    const [casesTotal, running, listed] = await Promise.all([
      repo.countCases(ws, agentId),
      repo.runningRun(ws, agentId),
      repo.listRuns(ws, agentId, EVAL_AGENT_RUNS_MAX),
    ]);
    const runs = markSkillsDelta(listed);
    const completed = runs.filter((r) => r.status === 'completed');
    const latest = completed[0] ?? null;
    const previous = completed[1] ?? null;
    let banner: EvalAgentDetail['banner'] = null;
    if (latest && previous) {
      const [l, p] = await Promise.all([repo.getRun(ws, latest.id), repo.getRun(ws, previous.id)]);
      if (l && p) banner = buildBanner(l, p);
    }
    return {
      agent_id: agentId,
      agent_name: agent.name,
      model: agent.model,
      cases_total: casesTotal,
      running,
      latest,
      previous,
      runs,
      trend: trendOf(completed),
      banner,
    };
  }

  // ---------- helpers ----------

  private async requireAgent(ws: string, agentId: string): Promise<AgentSnapshot> {
    const agent = await this.deps.repo.agentSnapshot(ws, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    return agent;
  }

  /** The finding file's slice of its PR's current raw diff. */
  private async fileDiffOf(ws: string, src: FindingSource): Promise<string> {
    let raw: string;
    try {
      raw = (await this.deps.diffs.loadPrDiff(ws, src.pr_id)).raw;
    } catch {
      throw unprocessable('diff_unavailable', "No diff is available for this finding's file");
    }
    const fileDiff = extractFileDiff(raw, src.file);
    if (fileDiff == null) throw unprocessable('diff_unavailable', "No diff is available for this finding's file");
    return fileDiff;
  }

  /** Size limit (AC-9) and hunk rule (AC-8, EC-15); returns the diff's file paths for `input_files`. */
  private validateFrozen(diff: string, expectation: EvalExpectation): string[] {
    const size = diffByteSize(diff);
    if (size > EVAL_MAX_FROZEN_DIFF_BYTES) {
      throw unprocessable('frozen_input_too_large', 'The frozen diff is too large', {
        size,
        limit: EVAL_MAX_FROZEN_DIFF_BYTES,
      });
    }
    const parsed = this.deps.parser.parse(diff);
    if (!expectationIntersectsHunk(parsed, expectation)) {
      throw unprocessable('expectation_outside_diff', 'The expectation range is outside the diff', {
        file: expectation.file,
        start_line: expectation.start_line,
        end_line: expectation.end_line,
        start: expectation.start_line,
        end: expectation.end_line,
      });
    }
    return parsed.files.map((f) => f.path);
  }
}
