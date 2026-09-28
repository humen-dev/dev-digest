// src/wait.ts — ring 2: polls run status until done/failed/cancelled/timeout/abort.
import type { ApiRun } from './domain/types.js';
import type { ToolContext } from './tools/types.js';

export type WaitOutcome =
  | { kind: 'done' | 'failed' | 'cancelled'; run: ApiRun }
  | { kind: 'timeout'; elapsedMs: number }
  | { kind: 'aborted' };

const TERMINAL_STATUSES = new Set(['done', 'failed', 'cancelled']);
const MAX_CONSECUTIVE_ERRORS = 2;

/**
 * Polls `ctx.api.listRuns(prId)` every `ctx.config.pollMs` until the run identified
 * by `runId` reaches a terminal status, the wait budget (`ctx.config.waitMs`) is
 * exhausted, or `ctx.signal` is aborted. A run missing from the list still counts
 * as running. Up to two consecutive listRuns errors are tolerated; the third rethrows.
 */
export async function waitForRun(o: {
  ctx: ToolContext;
  prId: string;
  runId: string;
  label: string;
}): Promise<WaitOutcome> {
  const { ctx, prId, runId, label } = o;
  const start = ctx.now();
  let consecutiveErrors = 0;

  for (;;) {
    if (ctx.signal.aborted) return { kind: 'aborted' };

    const elapsedMs = ctx.now() - start;
    if (elapsedMs >= ctx.config.waitMs) return { kind: 'timeout', elapsedMs };

    let runs: ApiRun[];
    try {
      runs = await ctx.api.listRuns(prId);
      consecutiveErrors = 0;
    } catch (err) {
      consecutiveErrors += 1;
      if (consecutiveErrors > MAX_CONSECUTIVE_ERRORS) throw err;
      runs = [];
    }

    const run = runs.find((r) => r.run_id === runId);
    const status = run?.status ?? null;

    const elapsedS = Math.floor((ctx.now() - start) / 1000);
    await ctx.progress({
      progress: elapsedS,
      total: Math.floor(ctx.config.waitMs / 1000),
      message: `${label}: ${status ?? 'running'} (${elapsedS}s)`,
    });

    if (run && status && TERMINAL_STATUSES.has(status)) {
      return { kind: status as 'done' | 'failed' | 'cancelled', run };
    }

    if (ctx.signal.aborted) return { kind: 'aborted' };

    const remaining = ctx.config.waitMs - (ctx.now() - start);
    if (remaining <= 0) return { kind: 'timeout', elapsedMs: ctx.now() - start };

    await ctx.sleep(Math.min(ctx.config.pollMs, remaining), ctx.signal);
  }
}
