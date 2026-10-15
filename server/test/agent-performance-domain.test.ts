import { describe, it, expect } from 'vitest';
import {
  agentStats,
  aggregatePerformance,
  type PerfInput,
  type PerfRun,
} from '../src/modules/agent-performance/domain/aggregate.js';

const H = 3_600_000;
const D = 24 * H;
const TO = new Date('2026-10-15T12:00:00.000Z');
const FROM = new Date(TO.getTime() - 30 * D);
const PERIOD = { from: FROM, to: TO };
const inside = (hoursAgo: number) => new Date(TO.getTime() - hoursAgo * H);

let seq = 0;
const run = (o: Partial<PerfRun> = {}): PerfRun => ({
  id: `r${String(++seq).padStart(5, '0')}`,
  agentId: 'a1',
  ranAt: inside(1),
  status: 'done',
  source: 'local',
  model: 'gpt',
  durationMs: 1000,
  costUsd: 0.01,
  ...o,
});
const A = (id: string, name = id, enabled = true) => ({ id, name, enabled });
const input = (runs: PerfRun[], decisions: PerfInput['decisions'] = [], agents = [A('a1')]): PerfInput => ({
  period: PERIOD, agents, runs, decisions,
});
const row = (i: PerfInput, id = 'a1') => aggregatePerformance(i).agents.find((r) => r.agent_id === id)!;

describe('averages', () => {
  it('avg cost of null / 0 / 0.02 = 0.01; all null -> null (AC-18, EC-6)', () => {
    const r = row(input([run({ costUsd: null }), run({ costUsd: 0 }), run({ costUsd: 0.02 })]));
    expect(r.avg_cost_usd).toBeCloseTo(0.01, 10);
    expect(r.unpriced_runs).toBe(1);
    expect(row(input([run({ costUsd: null })])).avg_cost_usd).toBeNull();
  });
  it('failed / cancelled count in runs but not in averages (AC-19, EC-5)', () => {
    const r = row(input([
      run({ durationMs: 2000, costUsd: 0.1 }),
      run({ status: 'failed', durationMs: 90_000, costUsd: 9 }),
      run({ status: 'cancelled', durationMs: 90_000, costUsd: 9 }),
    ]));
    expect(r.runs).toBe(3);
    expect(r.avg_cost_usd).toBeCloseTo(0.1, 10);
    expect(r.avg_duration_ms).toBe(2000);
    expect(r.unpriced_runs).toBe(0);
  });
  it('negative / NaN cost is unpriced, -1 ms duration is not timed (UT-5, UT-6)', () => {
    const r = row(input([
      run({ costUsd: -5, durationMs: -1 }),
      run({ costUsd: Number.NaN, durationMs: 500 }),
      run({ costUsd: 0.04, durationMs: 1500 }),
    ]));
    expect(r.unpriced_runs).toBe(2);
    expect(r.avg_cost_usd).toBeCloseTo(0.04, 10);
    expect(r.avg_duration_ms).toBe(1000);
    expect(aggregatePerformance(input([run({ costUsd: -5 })])).summary.unpriced_runs).toBe(1);
  });
  it('running runs are never counted (EC-1)', () => {
    const p = aggregatePerformance(input([run({ status: 'running' })]));
    expect(p.summary.runs).toBe(0);
    expect(p.run_buckets.buckets.reduce((s, b) => s + b.runs, 0)).toBe(0);
  });
});

describe('accept rate', () => {
  it('3 accepted, 1 dismissed, 2 pending -> 0.75; decided 0 -> null (AC-20)', () => {
    const r1 = run();
    const r = row(input([r1], [{ runId: r1.id, accepted: 3, dismissed: 1, pending: 2 }]));
    expect(r.accept_rate).toBe(0.75);
    expect([r.accepted, r.dismissed, r.pending, r.decided]).toEqual([3, 1, 2, 4]);
    const r2 = run();
    expect(row(input([r2], [{ runId: r2.id, accepted: 0, dismissed: 0, pending: 4 }])).accept_rate).toBeNull();
  });
  it('pools 1/1 and 10/100 into 11/101 (AC-27)', () => {
    const x = run({ agentId: 'a1' });
    const y = run({ agentId: 'a2' });
    const p = aggregatePerformance(input([x, y], [
      { runId: x.id, accepted: 1, dismissed: 0, pending: 0 },
      { runId: y.id, accepted: 10, dismissed: 90, pending: 0 },
    ], [A('a1'), A('a2')]));
    expect(p.summary.avg_accept_rate).toBeCloseTo(11 / 101, 12);
    expect(p.summary.decided).toBe(101);
    expect(p.summary.accepted).toBe(11);
  });
});

describe('breakdowns', () => {
  it('model switch -> two segments, null model -> Unknown model (AC-25, EC-4)', () => {
    const p = aggregatePerformance(input([
      run({ model: 'gpt', costUsd: 0.5 }),
      run({ model: 'claude', costUsd: 0.25 }),
      run({ model: null, costUsd: 0.125 }),
    ]));
    expect(p.cost_by_model.map((s) => [s.label, s.value])).toEqual([
      ['gpt', 0.5], ['claude', 0.25], ['Unknown model', 0.125],
    ]);
    expect(p.summary.total_cost_usd).toBeCloseTo(0.875, 10);
  });
  it('zero-cost rows have no segment but stay in the total', () => {
    const p = aggregatePerformance(input([run({ costUsd: 0 })]));
    expect(p.cost_by_agent).toEqual([]);
    expect(p.summary.total_cost_usd).toBe(0);
  });
  it('total cost is null with no priced run; priced_ci_runs counts CI priced runs', () => {
    expect(aggregatePerformance(input([run({ costUsd: null })])).summary.total_cost_usd).toBeNull();
    const p = aggregatePerformance(input([run({ source: 'ci' }), run({ source: 'ci', costUsd: null }), run()]));
    expect(p.summary.priced_ci_runs).toBe(1);
  });
});

describe('rows, summary and trends', () => {
  it('most-active ties: runs, later last run, name asc; empty -> null (AC-26)', () => {
    const agents = [A('a', 'Bravo'), A('b', 'Alpha'), A('c', 'Charlie')];
    const p1 = aggregatePerformance(input([
      run({ agentId: 'a', ranAt: inside(5) }), run({ agentId: 'b', ranAt: inside(5) }),
      run({ agentId: 'c', ranAt: inside(9) }),
    ], [], agents));
    expect(p1.summary.most_active?.agent_name).toBe('Alpha'); // tie on runs and last run -> name
    const p2 = aggregatePerformance(input([
      run({ agentId: 'a', ranAt: inside(2) }), run({ agentId: 'b', ranAt: inside(5) }),
    ], [], agents));
    expect(p2.summary.most_active?.agent_name).toBe('Bravo'); // later last run wins
    const p3 = aggregatePerformance(input([
      run({ agentId: 'a' }), run({ agentId: 'a' }), run({ agentId: 'b' }),
    ], [], agents));
    expect(p3.summary.most_active?.agent_name).toBe('Bravo'); // more runs
    expect(aggregatePerformance(input([], [], agents)).summary.most_active).toBeNull();
  });
  it('agents with no runs are present with zeros; unknown agent is one last row (AC-16, AC-17)', () => {
    const p = aggregatePerformance(input([run({ agentId: null }), run({ agentId: null })], [], [A('z', 'Zed', false), A('a1', 'Amy')]));
    expect(p.agents.map((r) => r.agent_name)).toEqual(['Amy', 'Zed', 'Unknown agent']);
    const zed = p.agents[1]!;
    expect([zed.runs, zed.avg_cost_usd, zed.avg_duration_ms, zed.accept_rate, zed.last_run_at, zed.enabled]).toEqual([0, null, null, null, null, false]);
    const unknown = p.agents[2]!;
    expect([unknown.agent_id, unknown.enabled, unknown.runs]).toEqual([null, null, 2]);
    expect(p.cost_by_agent[0]!.key).toBe('unknown-agent');
  });
  it('no unknown row without counted runs in the period', () => {
    const p = aggregatePerformance(input([run({ agentId: null, ranAt: inside(24 * 40) })]));
    expect(p.agents.map((r) => r.agent_id)).toEqual(['a1']);
  });
  it('previous period: total cost, per-row rate/decided, per-agent avg cost (AC-31..33)', () => {
    const old1 = run({ ranAt: inside(24 * 40), costUsd: 0.2 });
    const old2 = run({ ranAt: inside(24 * 41), costUsd: 0.4 });
    const i = input([old1, old2, run({ costUsd: null })], [{ runId: old1.id, accepted: 1, dismissed: 3, pending: 0 }]);
    const p = aggregatePerformance(i);
    expect(p.summary.prev_total_cost_usd).toBeCloseTo(0.6, 10);
    expect(p.summary.total_cost_usd).toBeNull();
    expect(p.summary.runs).toBe(1);
    expect(p.agents[0]!.prev_accept_rate).toBe(0.25);
    expect(p.agents[0]!.prev_decided).toBe(4);
    expect(agentStats(i, 'a1').prev_avg_cost_usd).toBeCloseTo(0.3, 10);
  });
  it('7 runs -> 5 newest first, ties by id desc (AC-35)', () => {
    const runs = [1, 2, 3, 4, 5, 6, 7].map((h) => run({ ranAt: inside(h) }));
    const rec = row(input(runs)).recent_runs;
    expect(rec).toHaveLength(5);
    expect(rec.map((r) => r.run_id)).toEqual(runs.slice(0, 5).map((r) => r.id));
    const t = inside(3);
    const tied = row(input([run({ ranAt: t }), run({ ranAt: t })])).recent_runs;
    expect(tied[0]!.run_id > tied[1]!.run_id).toBe(true);
  });
  it('30-day period -> 30 day buckets (AC-34)', () => {
    const p = aggregatePerformance(input([run()]));
    expect(p.run_buckets.size).toBe('day');
    expect(p.run_buckets.buckets).toHaveLength(30);
  });
  it('is deterministic (NFR-4)', () => {
    const i = input([run(), run({ agentId: null })]);
    expect(aggregatePerformance(i)).toEqual(aggregatePerformance(i));
  });
});

// Deterministic PRNG so failures are reproducible.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('properties (random fixtures)', () => {
  it('holds sums, buckets and stats == row over 250 cases', () => {
    const rnd = mulberry32(42);
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
    const spans = [6 * H, 24 * H, 30 * H, 7 * D, 30 * D];
    for (let c = 0; c < 250; c++) {
      const span = pick(spans);
      const period = { from: new Date(TO.getTime() - span), to: TO };
      const agents = Array.from({ length: Math.floor(rnd() * 4) }, (_, i) => A(`ag${i}`, `Agent ${pick(['x', 'y', 'z'])}${i}`, rnd() > 0.3));
      const runs: PerfRun[] = [];
      const decisions: PerfInput['decisions'] = [];
      const n = Math.floor(rnd() * 40);
      for (let i = 0; i < n; i++) {
        const r: PerfRun = {
          id: `p${c}-${i}`,
          agentId: rnd() < 0.15 || agents.length === 0 ? null : pick(agents).id,
          ranAt: new Date(TO.getTime() - Math.floor(rnd() * span * 2.1) + (rnd() < 0.05 ? -1 : 0)),
          status: pick(['done', 'done', 'done', 'failed', 'cancelled', 'running']),
          source: pick(['local', 'ci'] as const),
          model: pick([null, 'm1', 'm2', 'm3']),
          durationMs: pick([null, -1, 0, 500, 1234]),
          costUsd: pick([null, Number.NaN, -2, 0, 0.001, 0.37, 1.5]),
        };
        runs.push(r);
        if (rnd() < 0.6) decisions.push({ runId: r.id, accepted: Math.floor(rnd() * 5), dismissed: Math.floor(rnd() * 5), pending: Math.floor(rnd() * 3) });
      }
      const i: PerfInput = { period, agents, runs, decisions };
      const p = aggregatePerformance(i);

      const total = p.summary.total_cost_usd ?? 0;
      const sumAgent = p.cost_by_agent.reduce((s, x) => s + x.value, 0);
      const sumModel = p.cost_by_model.reduce((s, x) => s + x.value, 0);
      expect(Math.abs(sumAgent - total)).toBeLessThan(1e-6);
      expect(Math.abs(sumModel - total)).toBeLessThan(1e-6);
      expect(p.agents.reduce((s, r) => s + r.runs, 0)).toBe(p.summary.runs);
      expect(p.run_buckets.buckets.reduce((s, b) => s + b.runs, 0)).toBe(p.summary.runs);
      expect(p.agents.reduce((s, r) => s + r.unpriced_runs, 0)).toBe(p.summary.unpriced_runs);

      for (const a of agents) {
        const s = agentStats(i, a.id);
        const r = p.agents.find((x) => x.agent_id === a.id)!;
        expect([s.runs, s.avg_cost_usd, s.avg_duration_ms, s.accept_rate, s.accepted, s.decided, s.unpriced_runs])
          .toEqual([r.runs, r.avg_cost_usd, r.avg_duration_ms, r.accept_rate, r.accepted, r.decided, r.unpriced_runs]);
      }
    }
  });
});
