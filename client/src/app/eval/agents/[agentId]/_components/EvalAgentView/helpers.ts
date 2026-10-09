import type { EvalRunMetrics, EvalRunRecord } from "@devdigest/shared";
import type { MetricDeltas } from "@/components/eval/MetricTiles";

type Ratio = "recall" | "precision" | "citation_accuracy";

function diff(a: EvalRunMetrics | null | undefined, b: EvalRunMetrics | null | undefined, key: Ratio) {
  const x = a?.[key];
  const y = b?.[key];
  return x == null || y == null ? null : x - y;
}

/** Latest − previous per ratio metric (0..1 scale); null when either side is missing. */
export function metricDeltas(latest: EvalRunRecord | null, previous: EvalRunRecord | null): MetricDeltas | undefined {
  if (!latest || !previous) return undefined;
  return {
    recall: diff(latest.metrics, previous.metrics, "recall"),
    precision: diff(latest.metrics, previous.metrics, "precision"),
    citation_accuracy: diff(latest.metrics, previous.metrics, "citation_accuracy"),
  };
}

/** Exactly two selected runs → the pair ordered older → newer (by start time); otherwise null (AC-50). */
export function comparePair(
  runs: readonly EvalRunRecord[],
  selectedIds: readonly string[],
): { olderId: string; newerId: string } | null {
  const picked = runs.filter((r) => selectedIds.includes(r.id));
  if (picked.length !== 2) return null;
  const [older, newer] = [...picked].sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
  return { olderId: older!.id, newerId: newer!.id };
}
