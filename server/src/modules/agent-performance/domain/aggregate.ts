import type {
  AgentPerf,
  AgentPerfRow,
  AgentStats,
  PerfCostSegment,
  PerfRecentRun,
} from '@devdigest/shared';
import {
  COUNTED_STATUSES,
  RECENT_RUNS_LIMIT,
  UNKNOWN_AGENT_KEY,
  UNKNOWN_AGENT_NAME,
  UNKNOWN_MODEL_KEY,
  UNKNOWN_MODEL_LABEL,
} from '../constants.js';
import { previousPeriod, runBuckets, type PeriodBounds } from './period.js';

export interface PerfAgent { id: string; name: string; enabled: boolean }
export interface PerfRun {
  id: string;
  agentId: string | null;
  ranAt: Date;
  status: string;
  source: 'local' | 'ci';
  model: string | null;
  durationMs: number | null;
  costUsd: number | null;
}
export interface PerfRunDecisions { runId: string; accepted: number; dismissed: number; pending: number }
export interface PerfInput {
  period: PeriodBounds;
  agents: PerfAgent[];
  runs: PerfRun[];
  decisions: PerfRunDecisions[];
}

interface Group {
  agentId: string | null;
  name: string;
  enabled: boolean | null;
  cur: PerfRun[];
  prev: PerfRun[];
}

interface Computed {
  perf: AgentPerf;
  /** Previous-period average cost per row, keyed by `agentId ?? UNKNOWN_AGENT_KEY`. */
  prevAvgCost: Map<string, number | null>;
}

const isCountedStatus = (s: string): boolean => (COUNTED_STATUSES as readonly string[]).includes(s);
const isPriced = (r: PerfRun): boolean =>
  r.status === 'done' && r.costUsd !== null && Number.isFinite(r.costUsd) && r.costUsd >= 0;
const isTimed = (r: PerfRun): boolean =>
  r.status === 'done' && r.durationMs !== null && Number.isFinite(r.durationMs) && r.durationMs >= 0;

/** Code-unit comparison, locale independent (deterministic output, NFR-4). */
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const rate = (accepted: number, decided: number): number | null => (decided > 0 ? accepted / decided : null);

function avgCost(runs: PerfRun[]): number | null {
  const priced = runs.filter(isPriced);
  if (priced.length === 0) return null;
  return priced.reduce((s, r) => s + (r.costUsd as number), 0) / priced.length;
}

function sumCost(runs: PerfRun[]): number | null {
  const priced = runs.filter(isPriced);
  if (priced.length === 0) return null;
  return priced.reduce((s, r) => s + (r.costUsd as number), 0);
}

function avgDuration(runs: PerfRun[]): number | null {
  const timed = runs.filter(isTimed);
  if (timed.length === 0) return null;
  return timed.reduce((s, r) => s + (r.durationMs as number), 0) / timed.length;
}

function newestFirst(a: PerfRun, b: PerfRun): number {
  return b.ranAt.getTime() - a.ranAt.getTime() || cmp(b.id, a.id);
}

function toSegments(entries: Map<string, { label: string; value: number }>): PerfCostSegment[] {
  return [...entries.entries()]
    .filter(([, e]) => e.value > 0)
    .map(([key, e]) => ({ key, label: e.label, value: e.value }))
    .sort((a, b) => b.value - a.value || cmp(a.label, b.label));
}

function compute(input: PerfInput): Computed {
  const { period } = input;
  const prev = previousPeriod(period);
  const fromMs = period.from.getTime();
  const toMs = period.to.getTime();
  const prevFromMs = prev.from.getTime();

  const known = new Set(input.agents.map((a) => a.id));
  const decisionsByRun = new Map(input.decisions.map((d) => [d.runId, d]));

  const curRuns: PerfRun[] = [];
  const prevRuns: PerfRun[] = [];
  for (const r of input.runs) {
    if (!isCountedStatus(r.status)) continue;
    const t = r.ranAt.getTime();
    if (t >= fromMs && t <= toMs) curRuns.push(r);
    else if (t >= prevFromMs && t < fromMs) prevRuns.push(r);
  }

  const groups = new Map<string, Group>();
  const agents = [...input.agents].sort((a, b) => cmp(a.name, b.name) || cmp(a.id, b.id));
  for (const a of agents) {
    groups.set(a.id, { agentId: a.id, name: a.name, enabled: a.enabled, cur: [], prev: [] });
  }
  const unknown: Group = { agentId: null, name: UNKNOWN_AGENT_NAME, enabled: null, cur: [], prev: [] };
  const groupOf = (r: PerfRun): Group =>
    r.agentId !== null && known.has(r.agentId) ? (groups.get(r.agentId) as Group) : unknown;
  for (const r of curRuns) groupOf(r).cur.push(r);
  for (const r of prevRuns) groupOf(r).prev.push(r);

  const ordered = [...groups.values()];
  if (unknown.cur.length > 0) ordered.push(unknown);

  const decisionsOf = (runs: PerfRun[]) => {
    let accepted = 0;
    let dismissed = 0;
    let pending = 0;
    for (const r of runs) {
      const d = decisionsByRun.get(r.id);
      if (!d) continue;
      accepted += d.accepted;
      dismissed += d.dismissed;
      pending += d.pending;
    }
    return { accepted, dismissed, pending, decided: accepted + dismissed };
  };

  const prevAvgCost = new Map<string, number | null>();
  const rows: AgentPerfRow[] = ordered.map((g) => {
    const d = decisionsOf(g.cur);
    const pd = decisionsOf(g.prev);
    prevAvgCost.set(g.agentId ?? UNKNOWN_AGENT_KEY, avgCost(g.prev));
    const sorted = [...g.cur].sort(newestFirst);
    const recent: PerfRecentRun[] = sorted.slice(0, RECENT_RUNS_LIMIT).map((r) => ({
      run_id: r.id,
      ran_at: r.ranAt.toISOString(),
      status: r.status as PerfRecentRun['status'],
      source: r.source,
      duration_ms: r.durationMs !== null && Number.isFinite(r.durationMs) ? r.durationMs : null,
      cost_usd: r.costUsd !== null && Number.isFinite(r.costUsd) ? r.costUsd : null,
    }));
    return {
      agent_id: g.agentId,
      agent_name: g.name,
      enabled: g.enabled,
      runs: g.cur.length,
      unpriced_runs: g.cur.filter((r) => r.status === 'done' && !isPriced(r)).length,
      total_cost_usd: sumCost(g.cur),
      avg_cost_usd: avgCost(g.cur),
      avg_duration_ms: avgDuration(g.cur),
      accepted: d.accepted,
      dismissed: d.dismissed,
      pending: d.pending,
      decided: d.decided,
      accept_rate: rate(d.accepted, d.decided),
      prev_accept_rate: rate(pd.accepted, pd.decided),
      prev_decided: pd.decided,
      last_run_at: sorted[0] ? sorted[0].ranAt.toISOString() : null,
      recent_runs: recent,
    };
  });

  // Summary.
  const accepted = rows.reduce((s, r) => s + r.accepted, 0);
  const decided = rows.reduce((s, r) => s + r.decided, 0);
  const active = rows.filter((r) => r.runs > 0).sort(
    (a, b) =>
      b.runs - a.runs ||
      cmp(b.last_run_at ?? '', a.last_run_at ?? '') ||
      cmp(a.agent_name, b.agent_name),
  );
  const top = active[0];

  // Cost breakdowns (priced runs only; the same set that feeds total cost).
  const byAgent = new Map<string, { label: string; value: number }>();
  const byModel = new Map<string, { label: string; value: number }>();
  for (const g of ordered) {
    for (const r of g.cur) {
      if (!isPriced(r)) continue;
      const cost = r.costUsd as number;
      const aKey = g.agentId ?? UNKNOWN_AGENT_KEY;
      const a = byAgent.get(aKey) ?? { label: g.name, value: 0 };
      a.value += cost;
      byAgent.set(aKey, a);
      const mKey = r.model ?? UNKNOWN_MODEL_KEY;
      const m = byModel.get(mKey) ?? { label: r.model ?? UNKNOWN_MODEL_LABEL, value: 0 };
      m.value += cost;
      byModel.set(mKey, m);
    }
  }

  const perf: AgentPerf = {
    period: { from: period.from.toISOString(), to: period.to.toISOString() },
    previous_period: { from: prev.from.toISOString(), to: prev.to.toISOString() },
    summary: {
      runs: rows.reduce((s, r) => s + r.runs, 0),
      total_cost_usd: sumCost(curRuns),
      prev_total_cost_usd: sumCost(prevRuns),
      unpriced_runs: rows.reduce((s, r) => s + r.unpriced_runs, 0),
      priced_ci_runs: curRuns.filter((r) => r.source === 'ci' && isPriced(r)).length,
      avg_accept_rate: rate(accepted, decided),
      accepted,
      decided,
      most_active: top
        ? { agent_id: top.agent_id, agent_name: top.agent_name, runs: top.runs, accept_rate: top.accept_rate }
        : null,
    },
    run_buckets: runBuckets(period, curRuns),
    agents: rows,
    cost_by_agent: toSegments(byAgent),
    cost_by_model: toSegments(byModel),
  };
  return { perf, prevAvgCost };
}

export function aggregatePerformance(input: PerfInput): AgentPerf {
  return compute(input).perf;
}

/** One agent's KPIs: the same aggregation on the agent-filtered input, projected to its row. */
export function agentStats(input: PerfInput, agentId: string): AgentStats {
  const agent = input.agents.find((a) => a.id === agentId);
  if (!agent) throw new Error(`agentStats: agent ${agentId} is not in the input`);
  const runs = input.runs.filter((r) => r.agentId === agentId);
  const runIds = new Set(runs.map((r) => r.id));
  const filtered: PerfInput = {
    period: input.period,
    agents: [agent],
    runs,
    decisions: input.decisions.filter((d) => runIds.has(d.runId)),
  };
  const { perf, prevAvgCost } = compute(filtered);
  const row = perf.agents.find((r) => r.agent_id === agentId) as AgentPerfRow;
  return {
    agent_id: agent.id,
    agent_name: agent.name,
    period: perf.period,
    previous_period: perf.previous_period,
    runs: row.runs,
    unpriced_runs: row.unpriced_runs,
    avg_cost_usd: row.avg_cost_usd,
    prev_avg_cost_usd: prevAvgCost.get(agentId) ?? null,
    avg_duration_ms: row.avg_duration_ms,
    accepted: row.accepted,
    dismissed: row.dismissed,
    pending: row.pending,
    decided: row.decided,
    accept_rate: row.accept_rate,
    run_buckets: perf.run_buckets,
  };
}
