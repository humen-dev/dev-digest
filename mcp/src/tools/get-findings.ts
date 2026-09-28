// src/tools/get-findings.ts — ring 2: use case. Read-only: never starts or waits for a review.
import { ToolError } from '../errors.js';
import { clip } from '../format/text.js';
import { formatReview } from '../format/review.js';
import { resolveAgent, resolvePull, resolveRepo } from '../resolve.js';
import type { ApiPull, ApiRepo, ApiRun, RunningResult } from '../domain/types.js';
import type { ToolHandler } from './types.js';

function elapsedSeconds(ctx: { now(): number }, ranAt: string | null): number {
  if (!ranAt) return 0;
  const startedMs = Date.parse(ranAt);
  if (Number.isNaN(startedMs)) return 0;
  return Math.max(0, Math.floor((ctx.now() - startedMs) / 1000));
}

function runningResult(
  repo: ApiRepo,
  pull: ApiPull,
  runId: string,
  agentName: string | null,
  elapsedS: number,
  next: string,
): RunningResult {
  return {
    status: 'running',
    repo: repo.full_name,
    pr: pull.number,
    run_id: runId,
    agent: agentName,
    elapsed_s: elapsedS,
    next,
  };
}

function runFailedError(run: ApiRun): ToolError {
  return new ToolError(
    'run_failed',
    `Review run ${run.run_id} failed: ${clip(run.error ?? 'unknown error', 300)}`,
    'Check the LLM API key / model in DevDigest Settings, then call run_agent_on_pr again.',
  );
}

function runCancelledError(run: ApiRun): ToolError {
  return new ToolError(
    'run_cancelled',
    `Review run ${run.run_id} was cancelled.`,
    'Call run_agent_on_pr again to start a new run.',
  );
}

/** Reads the findings/verdict of an already-finished review. Never calls startReview or warmPull. */
export const getFindings: ToolHandler<'get_findings'> = async (args, ctx) => {
  const repo = await resolveRepo(ctx.api, args.repo);
  const pull = await resolvePull(ctx.api, repo, args.pr);
  const agent = args.agent !== undefined
    ? await resolveAgent(ctx.api, args.agent, { requireEnabled: false })
    : null;

  if (args.run_id !== undefined) {
    const runs = await ctx.api.listRuns(pull.id);
    const run = runs.find((r) => r.run_id === args.run_id);
    if (!run) {
      throw new ToolError(
        'run_not_found',
        `Run "${clip(args.run_id, 100)}" not found for ${repo.full_name}#${pull.number}.`,
        'Omit run_id to read the latest review, or call run_agent_on_pr.',
      );
    }
    if (agent && run.agent_id !== agent.id) {
      throw new ToolError(
        'invalid_argument',
        `Run ${run.run_id} belongs to agent "${clip(run.agent_name ?? 'unknown', 100)}", not "${clip(agent.name, 100)}".`,
        'Pass either run_id or agent, or an agent that matches the run.',
      );
    }
    if (run.status === 'running' || run.status === null) {
      return runningResult(
        repo,
        pull,
        run.run_id,
        run.agent_name,
        elapsedSeconds(ctx, run.ran_at),
        'Call get_findings again in about 30 seconds.',
      );
    }
    if (run.status === 'failed') throw runFailedError(run);
    if (run.status === 'cancelled') throw runCancelledError(run);

    const reviews = await ctx.api.listReviews(pull.id);
    const review = reviews.find((r) => r.run_id === run.run_id && r.kind === 'review');
    if (!review) {
      throw new ToolError(
        'no_review',
        `Run ${run.run_id} finished but no review was found for it.`,
        'Call get_findings(repo, pr) to read the latest review.',
      );
    }
    return formatReview({
      repo: repo.full_name,
      pr: pull.number,
      review,
      run,
      minSeverity: args.min_severity,
      limit: args.limit,
    });
  }

  const [reviews, runs] = await Promise.all([ctx.api.listReviews(pull.id), ctx.api.listRuns(pull.id)]);
  const isMine = (agentId: string | null) => agent === null || agentId === agent.id;

  // "Newest" is chosen explicitly, not trusted from the API's list order.
  const candidate = reviews
    .filter((r) => r.kind === 'review' && isMine(r.agent_id))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (candidate) {
    // A re-run still in progress must not hide behind the previous verdict — but
    // only a run that started AFTER that review counts: a stale row stuck in
    // 'running' (API died mid-run) must not shadow a current verdict forever.
    const newerRunning = runs
      .filter(
        (r) =>
          r.status === 'running' &&
          isMine(r.agent_id) &&
          r.run_id !== candidate.run_id &&
          r.ran_at !== null &&
          Date.parse(r.ran_at) > Date.parse(candidate.created_at),
      )
      .sort((a, b) => (b.ran_at ?? '').localeCompare(a.ran_at ?? ''))[0];
    const result = formatReview({
      repo: repo.full_name,
      pr: pull.number,
      review: candidate,
      run: runs.find((r) => r.run_id === candidate.run_id) ?? null,
      minSeverity: args.min_severity,
      limit: args.limit,
    });
    if (!newerRunning) return result;
    return {
      ...result,
      newer_run: { run_id: newerRunning.run_id, status: 'running' as const },
      next: `A newer review (${newerRunning.run_id}) is still running; call get_findings with that run_id in about 30 seconds.`,
    };
  }

  // No finished review yet. A persisted 'running' row alone is not proof of a
  // live run (a row can stay 'running' forever if the API died mid-run), so
  // only /runs/active decides; otherwise fall through to no_review.
  const active = await ctx.api.listActiveRuns(pull.id);
  const activeMatch = active.find((r) => isMine(r.agent_id));
  if (activeMatch) {
    const row = runs.find((r) => r.run_id === activeMatch.run_id);
    return runningResult(
      repo,
      pull,
      activeMatch.run_id,
      activeMatch.agent_name,
      elapsedSeconds(ctx, row?.ran_at ?? null),
      'Call get_findings again in about 30 seconds.',
    );
  }

  throw new ToolError(
    'no_review',
    `No finished review for ${repo.full_name}#${pull.number}`,
    'Call run_agent_on_pr(repo, pr, agent); list_agents gives valid agents.',
  );
};
