import { describe, it, expect } from 'vitest';
import { BlastRadiusResponse } from '@devdigest/shared';
import { buildBlastRadius } from '../src/modules/blast/domain/build-blast-radius.js';
import { resolveDegradation } from '../src/modules/blast/domain/degradation.js';
import { formatBlastSummary } from '../src/modules/blast/domain/summary.js';
import type { BlastCallerRow, BlastResult } from '../src/modules/repo-intel/types.js';

const OPTS = { maxCallersPerSymbol: 20, degraded: false, reason: null } as const;
const caller = (file: string, symbol: string, via: string, line: number, rank = 0): BlastCallerRow => ({
  file,
  symbol,
  viaSymbol: via,
  line,
  rank,
});
const base = (over: Partial<BlastResult>): BlastResult => ({
  changedSymbols: [{ file: 'src/lib.ts', name: 'helper', kind: 'function' }],
  callers: [],
  impactedEndpoints: [],
  ...over,
});

describe('buildBlastRadius', () => {
  it('groups by viaSymbol, drops declaring-file callers, sorts by rank/file/line and dedups', () => {
    const out = buildBlastRadius(
      base({
        changedSymbols: [
          { file: 'src/lib.ts', name: 'helper', kind: 'function' },
          { file: 'src/lib.ts', name: 'other', kind: 'function' },
        ],
        callers: [
          caller('src/lib.ts', 'self', 'helper', 1, 9), // declaring file → dropped
          caller('src/b.ts', 'b', 'helper', 5, 1),
          caller('src/a.ts', 'a', 'helper', 9, 1),
          caller('src/a.ts', 'a', 'helper', 3, 1),
          caller('src/a.ts', 'a', 'helper', 3, 1), // duplicate
          caller('src/top.ts', 't', 'helper', 2, 5),
          caller('src/x.ts', 'x', 'other', 1, 0),
        ],
      }),
      OPTS,
    );
    expect(out.downstream.map((d) => d.symbol)).toEqual(['helper', 'other']);
    expect(out.downstream[0]!.callers).toEqual([
      { name: 't', file: 'src/top.ts', line: 2 },
      { name: 'a', file: 'src/a.ts', line: 3 },
      { name: 'a', file: 'src/a.ts', line: 9 },
      { name: 'b', file: 'src/b.ts', line: 5 },
    ]);
    expect(out.stats).toEqual({ symbols: 2, callers: 5, endpoints: 0, crons: 0 });
    expect(BlastRadiusResponse.parse(out)).toEqual(out);
  });

  it('omits symbols whose only callers are in the declaring file', () => {
    const out = buildBlastRadius(base({ callers: [caller('src/lib.ts', 'self', 'helper', 1)] }), OPTS);
    expect(out.downstream).toEqual([]);
    expect(out.stats.callers).toBe(0);
  });

  it('caps callers per symbol (21 → 20)', () => {
    const callers = Array.from({ length: 21 }, (_, i) => caller(`src/f${String(i).padStart(2, '0')}.ts`, 'c', 'helper', 1));
    const out = buildBlastRadius(base({ callers }), OPTS);
    expect(out.downstream[0]!.callers).toHaveLength(20);
    expect(out.stats.callers).toBe(20);
  });

  it('orders groups by top rank, then caller count, then symbol', () => {
    const out = buildBlastRadius(
      base({
        changedSymbols: ['a', 'b', 'c', 'd'].map((name) => ({ file: 'src/lib.ts', name, kind: 'function' })),
        callers: [
          caller('x.ts', 'x', 'a', 1, 1),
          caller('y.ts', 'y', 'b', 1, 5),
          caller('z.ts', 'z', 'c', 1, 1),
          caller('w.ts', 'w', 'c', 2, 1),
          caller('v.ts', 'v', 'd', 1, 1),
        ],
      }),
      OPTS,
    );
    expect(out.downstream.map((d) => d.symbol)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('attributes endpoints/crons from kept caller files, deduplicated and sorted', () => {
    const out = buildBlastRadius(
      base({
        callers: [caller('src/a.ts', 'a', 'helper', 1, 2), caller('src/b.ts', 'b', 'helper', 1, 1)],
        impactedEndpoints: ['GET /a', 'POST /b', 'GET /orphan'],
        factsByFile: {
          'src/a.ts': { endpoints: ['POST /b', 'GET /a'], crons: ['nightly'] },
          'src/b.ts': { endpoints: ['GET /a'], crons: ['nightly', 'hourly'] },
        },
      }),
      OPTS,
    );
    expect(out.downstream[0]!.endpoints_affected).toEqual(['GET /a', 'POST /b']);
    expect(out.downstream[0]!.crons_affected).toEqual(['hourly', 'nightly']);
    expect(out.unattributed_endpoints).toEqual(['GET /orphan']);
    expect(out.stats).toMatchObject({ endpoints: 3, crons: 2 });
  });

  it('puts all endpoints in unattributed_endpoints when factsByFile is absent', () => {
    const out = buildBlastRadius(
      base({ callers: [caller('src/a.ts', 'a', 'helper', 1)], impactedEndpoints: ['POST /z', 'GET /a', 'GET /a'] }),
      OPTS,
    );
    expect(out.downstream[0]!.endpoints_affected).toEqual([]);
    expect(out.unattributed_endpoints).toEqual(['GET /a', 'POST /z']);
    expect(out.stats.endpoints).toBe(2);
  });

  it('builds the summary with singular/plural and the degraded suffix', () => {
    const one = buildBlastRadius(
      base({
        callers: [caller('src/a.ts', 'a', 'helper', 1), caller('src/b.ts', 'b', 'helper', 1)],
        impactedEndpoints: ['GET /a'],
      }),
      OPTS,
    );
    expect(one.summary).toBe('1 symbol · 2 callers · 1 endpoint · 0 cron jobs');
    const deg = buildBlastRadius(base({}), { ...OPTS, degraded: true, reason: 'no_data' });
    expect(deg.summary).toBe('1 symbol · 0 callers · 0 endpoints · 0 cron jobs (index degraded: no_data)');
    expect(formatBlastSummary({ symbols: 2, callers: 14, endpoints: 3, crons: 1 }, null)).toBe(
      '2 symbols · 14 callers · 3 endpoints · 1 cron job',
    );
  });
});

describe('resolveDegradation', () => {
  const ok = { status: 'full' as const };
  it.each([
    ['flag off wins', { degraded: true, reason: 'no_data' as const }, { status: 'degraded' as const }, false, true, 'flag_off'],
    ['facade degraded → index degradedReason', { degraded: true, reason: 'no_data' as const }, { status: 'degraded' as const, degradedReason: 'repo_too_large' as const }, true, true, 'repo_too_large'],
    ['facade degraded + failed index', { degraded: true, reason: 'no_data' as const }, { status: 'failed' as const }, true, true, 'index_failed'],
    ['facade degraded → facade reason', { degraded: true, reason: 'no_data' as const }, { status: 'degraded' as const }, true, true, 'no_data'],
    ['facade degraded without reason', { degraded: true }, ok, true, true, 'no_data'],
    ['partial index', {}, { status: 'partial' as const }, true, true, 'index_partial'],
    ['healthy', {}, ok, true, false, null],
  ])('%s', (_n, blast, state, enabled, degraded, reason) => {
    expect(resolveDegradation(blast, state, enabled)).toEqual({ degraded, reason });
  });
});
