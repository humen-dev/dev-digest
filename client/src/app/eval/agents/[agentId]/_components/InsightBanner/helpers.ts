import type { EvalMetricKey } from "@devdigest/shared";

/** `eval.metrics.*` label key per banner metric. */
export const METRIC_LABEL_KEY = {
  recall: "metrics.recall",
  precision: "metrics.precision",
  citation_accuracy: "metrics.citation",
} as const satisfies Record<EvalMetricKey, string>;

/** Magnitude in points, rounded to one decimal; 0 means "nothing to say". */
export function bannerPoints(points: number): number {
  return Math.round(Math.abs(points) * 10) / 10;
}
