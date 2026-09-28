// src/tools/run-agent-on-pr.ts — ring 2: the outcome-shaped "run a review and wait" use case.
import { formatReview } from '../format/review.js';
import { ToolError } from '../errors.js';
import { resolveAgent, resolvePull, resolveRepo } from '../resolve.js';
import { waitForRun } from '../wait.js';
import type { RunningResult } from '../domain/types.js';
import type { ToolHandler } from './types.js';

/**
 * Resolves repo/PR/agent, attaches to an already-running run for the same agent
 * (Decision 10a) or starts a new one after a best-effort warm-up, then waits for
 * it to finish (or times out and returns a RunningResult, per §3.6).
 */
export const runAgentOnPr: ToolHandler<'run_agent_on_pr'> = async (args, ctx) => {
  const repo = await resolveRepo(ctx.api, args.repo);
  const pull = await resolvePull(ctx.api, repo, args.pr);
  const agent = await resolveAgent(ctx.api, args.agent, { requireEnabled: true });

  const activeRuns = await ctx.api.listActiveRuns(pull.id);
  const activeForAgent = activeRuns.find((r) => r.agent_id === agent.id);

  let runId: string;
  let attached = false;

  if (activeForAgent) {
    runId = activeForAgent.run_id;
    attached = true;
  } else {
    try {
      await ctx.api.warmPull(pull.id);
    } catch (err) {
      ctx.log('warmPull failed, continuing', { error: String(err) });
    }
    const started = await ctx.api.startReview(pull.id, agent.id);
    runId = started.run_id;
  }

  const outcome = await waitForRun({ ctx, prId: pull.id, runId, label: `run_agent_on_pr(${args.repo}#${args.pr})` });

  if (outcome.kind === 'timeout' || outcome.kind === 'aborted') {
    const elapsedMs = outcome.kind === 'timeout' ? outcome.elapsedMs : ctx.now();
    const result: RunningResult = {
      status: 'running',
      repo: args.repo,
      pr: args.pr,
      run_id: runId,
      agent: agent.name,
      elapsed_s: Math.floor(elapsedMs / 1000),
      next: `Review still running; call get_findings with repo, pr and run_id ${runId} in about a minute.`,
    };
    return result;
  }

  if (outcome.kind === 'failed') {
    throw new ToolError(
      'run_failed',
      `Review run ${runId} failed: ${(outcome.run.error ?? 'unknown error').slice(0, 300)}`,
      'Check the LLM API key / model in DevDigest Settings, then call run_agent_on_pr again.',
    );
  }

  if (outcome.kind === 'cancelled') {
    throw new ToolError('run_cancelled', `Review run ${runId} was cancelled.`, 'Call run_agent_on_pr again to start a new run.');
  }

  const reviews = await ctx.api.listReviews(pull.id);
  const review = reviews.find((r) => r.run_id === runId);
  if (!review) {
    throw new ToolError('no_review', `No review found for finished run ${runId}.`, 'Call get_findings(repo, pr) to read the latest review.');
  }

  return formatReview({
    repo: args.repo,
    pr: args.pr,
    review,
    run: outcome.run,
    minSeverity: args.min_severity,
    limit: args.limit,
    attached: attached || undefined,
  });
};
