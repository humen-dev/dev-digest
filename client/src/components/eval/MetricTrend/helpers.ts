import type { EvalTrendPoint } from "@devdigest/shared";

/**
 * The vendored LineChart shares one x axis across series and draws a missing value
 * as 0, so only runs where every plotted metric exists are charted. Runs with an
 * n/a metric stay in the accessible table, never as a fake 0% point.
 */
export function plottablePoints(points: EvalTrendPoint[]): EvalTrendPoint[] {
  return points.filter((p) => p.recall !== null && p.precision !== null && p.citation_accuracy !== null);
}
