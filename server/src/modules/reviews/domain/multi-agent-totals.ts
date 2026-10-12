import type { AgentRunStatus } from '@devdigest/shared';

/**
 * SPEC-07 — totals of a multi-agent run (pure).
 *   totalDurationMs: wall-clock. While any run is still running: now − createdAt;
 *     otherwise createdAt → latest finishedAt (NOT the max of agent durations —
 *     agents may start at different moments).
 *   totalCostUsd: sum of the known costs; null when none is known.
 *   unpricedCount: runs whose cost is null.
 */
export function computeTotals(i: {
  createdAt: Date;
  now: Date;
  runs: Array<{ status: AgentRunStatus; finishedAt: Date | null; costUsd: number | null }>;
}): { totalDurationMs: number; totalCostUsd: number | null; unpricedCount: number } {
  const running = i.runs.some((r) => r.status === 'running');
  let endMs: number;
  if (running) {
    endMs = i.now.getTime();
  } else {
    const finished = i.runs.flatMap((r) => (r.finishedAt ? [r.finishedAt.getTime()] : []));
    endMs = finished.length > 0 ? Math.max(...finished) : i.createdAt.getTime();
  }
  const totalDurationMs = Math.max(0, Math.round(endMs - i.createdAt.getTime()));

  const costs = i.runs.flatMap((r) => (r.costUsd == null ? [] : [r.costUsd]));
  const totalCostUsd = costs.length > 0 ? Math.round(costs.reduce((a, b) => a + b, 0) * 1e9) / 1e9 : null;

  return { totalDurationMs, totalCostUsd, unpricedCount: i.runs.length - costs.length };
}
