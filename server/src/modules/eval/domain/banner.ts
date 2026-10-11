import type { EvalBanner, EvalCaseOutcome, EvalMetricKey, EvalRunDetail } from '@devdigest/shared';

const METRICS: EvalMetricKey[] = ['recall', 'precision', 'citation_accuracy'];

const stateOf = (o: EvalCaseOutcome): 'pass' | 'fail' | null =>
  o.status !== 'scored' ? null : o.pass ? 'pass' : 'fail';

/**
 * Banner for an agent's two most recent completed runs: the metric with the
 * largest absolute change (points = x100, rounded) plus the cases that flipped
 * pass/fail. Null when no metric is comparable or nothing moved.
 */
export function buildBanner(latest: EvalRunDetail, previous: EvalRunDetail): EvalBanner | null {
  if (!latest.metrics || !previous.metrics) return null;

  let best: { metric: EvalMetricKey; delta: number } | null = null;
  for (const metric of METRICS) {
    const a = previous.metrics[metric];
    const b = latest.metrics[metric];
    if (a == null || b == null) continue;
    const delta = b - a;
    if (best === null || Math.abs(delta) > Math.abs(best.delta)) best = { metric, delta };
  }
  if (!best) return null;
  const points = Math.round(Math.abs(best.delta) * 100);
  if (points === 0) return null;

  const before = new Map(previous.per_case.map((o) => [o.case_id, o]));
  const transitions: EvalBanner['transitions'] = [];
  for (const o of latest.per_case) {
    const prev = before.get(o.case_id);
    if (!prev) continue;
    const from = stateOf(prev);
    const to = stateOf(o);
    if (from && to && from !== to) transitions.push({ case_id: o.case_id, name: o.name, from, to });
  }

  return {
    metric: best.metric,
    direction: best.delta > 0 ? 'up' : 'down',
    points,
    agent_version: latest.agent_version,
    transitions,
  };
}
