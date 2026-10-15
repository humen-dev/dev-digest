import { describe, it, expect } from 'vitest';
import { PerfQuery } from '../src/modules/agent-performance/types.js';
import {
  parseInstant,
  previousPeriod,
  resolvePeriod,
  runBuckets,
} from '../src/modules/agent-performance/domain/period.js';
import { aggregatePerformance, type PerfRun } from '../src/modules/agent-performance/domain/aggregate.js';

const H = 3_600_000;
const D = 24 * H;
const NOW = new Date('2026-10-15T12:00:00.000Z');

const issuePaths = (q: unknown): string[] => {
  const r = PerfQuery.safeParse(q);
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
};

describe('parseInstant', () => {
  it('accepts Z, offsets and fractions', () => {
    expect(parseInstant('2026-10-15T12:00:00Z')?.toISOString()).toBe('2026-10-15T12:00:00.000Z');
    expect(parseInstant('2026-10-15T12:00:00+03:00')?.toISOString()).toBe('2026-10-15T09:00:00.000Z');
    expect(parseInstant('2026-10-15T12:00:00.123456-02:30')?.toISOString()).toBe('2026-10-15T14:30:00.123Z');
  });
  it('rejects non-calendar and malformed values', () => {
    expect(parseInstant('2026-02-30T00:00:00Z')).toBeNull();
    expect(parseInstant('2026-13-01T00:00:00Z')).toBeNull();
    expect(parseInstant('2026-10-15T24:00:00Z')).toBeNull();
    expect(parseInstant('2026-10-15T12:00:60Z')).toBeNull();
    expect(parseInstant('2026-10-15')).toBeNull();
    expect(parseInstant('2026-10-15T12:00:00')).toBeNull();
    expect(parseInstant('2026-10-15T12:00:00+25:00')).toBeNull();
    expect(parseInstant('nope')).toBeNull();
  });
});

describe('PerfQuery', () => {
  it('accepts none, both and offsets', () => {
    expect(PerfQuery.safeParse({}).success).toBe(true);
    expect(PerfQuery.safeParse({ from: '2026-10-01T00:00:00+03:00', to: '2026-10-15T00:00:00Z' }).success).toBe(true);
  });
  it('names the parameter in the issue path (UT-1)', () => {
    expect(issuePaths({ from: '2026-02-30T00:00:00Z', to: '2026-03-05T00:00:00Z' })).toEqual(['from']);
    expect(issuePaths({ from: '2026-03-05T00:00:00Z', to: '2026-02-30T00:00:00Z' })).toEqual(['to']);
    expect(issuePaths({ from: '2026-10-15T00:00:00Z', to: '2026-10-01T00:00:00Z' })).toEqual(['from']);
    expect(issuePaths({ from: '2025-01-01T00:00:00Z', to: '2026-02-05T00:00:00Z' })).toEqual(['to']); // ~400 d
    expect(issuePaths({ from: '2026-10-01T00:00:00Z' })).toEqual(['to']);
    expect(issuePaths({ to: '2026-10-01T00:00:00Z' })).toEqual(['from']);
  });
  it('accepts exactly 366 days', () => {
    expect(PerfQuery.safeParse({ from: '2025-01-01T00:00:00Z', to: '2026-01-02T00:00:00Z' }).success).toBe(true);
  });
});

describe('resolvePeriod / previousPeriod', () => {
  it('defaults to [now - 720 h, now] (AC-14)', () => {
    const p = resolvePeriod({}, NOW);
    expect(p.to).toEqual(NOW);
    expect(NOW.getTime() - p.from.getTime()).toBe(720 * H);
  });
  it('uses given bounds', () => {
    const p = resolvePeriod({ from: '2026-10-01T00:00:00Z', to: '2026-10-02T00:00:00Z' }, NOW);
    expect(p.from.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(p.to.toISOString()).toBe('2026-10-02T00:00:00.000Z');
  });
  it('previous period has equal length and ends at from', () => {
    const p = previousPeriod({ from: new Date(NOW.getTime() - 2 * D), to: NOW });
    expect(p.to.getTime()).toBe(NOW.getTime() - 2 * D);
    expect(p.from.getTime()).toBe(NOW.getTime() - 4 * D);
  });
});

describe('runBuckets', () => {
  const at = (ms: number) => ({ ranAt: new Date(ms) });
  it('30-day period -> 30 day buckets, oldest first, last closed at to (AC-34)', () => {
    const period = { from: new Date(NOW.getTime() - 720 * H), to: NOW };
    const b = runBuckets(period, [at(NOW.getTime()), at(NOW.getTime() - 1), at(period.from.getTime())]);
    expect(b.size).toBe('day');
    expect(b.buckets).toHaveLength(30);
    expect(b.buckets[29]!.runs).toBe(2);
    expect(b.buckets[0]!.runs).toBe(1);
    expect(b.buckets.reduce((s, x) => s + x.runs, 0)).toBe(3);
    expect(b.buckets[29]!.start).toBe(new Date(NOW.getTime() - D).toISOString());
  });
  it('24 h -> 24 hour buckets', () => {
    const period = { from: new Date(NOW.getTime() - 24 * H), to: NOW };
    const b = runBuckets(period, [at(NOW.getTime() - 30 * 60_000)]);
    expect(b.size).toBe('hour');
    expect(b.buckets).toHaveLength(24);
    expect(b.buckets[23]!.runs).toBe(1);
  });
  it('partial last day: ceil buckets and none lost', () => {
    const period = { from: new Date(NOW.getTime() - 50 * H), to: NOW };
    const b = runBuckets(period, [at(period.from.getTime()), at(NOW.getTime())]);
    expect(b.buckets).toHaveLength(3);
    expect(b.buckets.reduce((s, x) => s + x.runs, 0)).toBe(2);
  });
  it('ignores runs outside the period', () => {
    const period = { from: new Date(NOW.getTime() - D), to: NOW };
    const b = runBuckets(period, [at(period.from.getTime() - 1), at(NOW.getTime() + 1)]);
    expect(b.buckets.reduce((s, x) => s + x.runs, 0)).toBe(0);
  });
});

describe('period bounds classification (AC-13)', () => {
  it('counts runs at from and to, not at from - 1 ms or to + 1 ms', () => {
    const from = new Date('2026-10-14T00:00:00.000Z');
    const to = new Date('2026-10-15T00:00:00.000Z');
    const run = (id: string, t: number): PerfRun => ({
      id, agentId: 'a', ranAt: new Date(t), status: 'done', source: 'local', model: 'm', durationMs: 1, costUsd: 1,
    });
    const perf = aggregatePerformance({
      period: { from, to },
      agents: [{ id: 'a', name: 'A', enabled: true }],
      runs: [run('1', from.getTime()), run('2', to.getTime()), run('3', from.getTime() - 1), run('4', to.getTime() + 1)],
      decisions: [],
    });
    expect(perf.summary.runs).toBe(2);
    expect(perf.agents[0]!.recent_runs.map((r) => r.run_id).sort()).toEqual(['1', '2']);
  });
});
