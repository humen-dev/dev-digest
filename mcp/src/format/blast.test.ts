import { describe, expect, it } from 'vitest';
import type { ApiBlastRadius } from '../domain/types.js';
import { formatBlastRadius } from './blast.js';

const base = (over: Partial<ApiBlastRadius> = {}): ApiBlastRadius => ({
  changed_symbols: [], downstream: [], summary: 's',
  stats: { symbols: 0, callers: 0, endpoints: 0, crons: 0 },
  unattributed_endpoints: [], degraded: false, reason: null, ...over,
});
const O = { repo: 'a/b', pr: 1 };

describe('formatBlastRadius', () => {
  it('strips invisible and control characters from repo-derived strings', () => {
    const zeroWidth = String.fromCodePoint(0x200b);
    const bell = String.fromCodePoint(0x07);
    const tag = String.fromCodePoint(0xe0041);
    const r = formatBlastRadius(base({
      changed_symbols: [{ name: `fo${zeroWidth}o${tag}`, file: `a${bell}b.ts`, kind: 'function' }],
      downstream: [{
        symbol: `x${zeroWidth}`,
        callers: [{ name: `c${tag}`, file: 'f.ts', line: 3 }],
        endpoints_affected: [`GET /a${zeroWidth}`], crons_affected: [`cron${tag}`],
      }],
    }), O);
    expect(r.changed_symbols).toEqual(['foo (a b.ts)']);
    expect(r.downstream[0]).toEqual({ symbol: 'x', callers: ['c @ f.ts:3'], endpoints: ['GET /a'], crons: ['cron'] });
  });

  it('caps changed_symbols at 50 and says so', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ name: `s${i}`, file: 'f.ts', kind: 'function' }));
    const r = formatBlastRadius(base({ changed_symbols: many }), O);
    expect(r.changed_symbols).toHaveLength(50);
    expect(r.truncated).toContain('50 of 60');
    expect(formatBlastRadius(base(), O).truncated).toBeUndefined();
  });

  it('bounds downstream, per-symbol lists and other endpoints, naming every cut', () => {
    const n = <T,>(k: number, f: (i: number) => T): T[] => Array.from({ length: k }, (_, i) => f(i));
    const r = formatBlastRadius(base({
      downstream: [
        {
          symbol: 'hot',
          callers: n(25, (i) => `c${i}`).map((name, i) => ({ name, file: 'f.ts', line: i + 1 })),
          endpoints_affected: n(21, (i) => `GET /e${i}`),
          crons_affected: n(22, (i) => `cron${i}`),
        },
        ...n(55, (i) => ({ symbol: `s${i}`, callers: [], endpoints_affected: [], crons_affected: [] })),
      ],
      unattributed_endpoints: n(51, (i) => `GET /o${i}`),
    }), O);
    expect(r.downstream).toHaveLength(50);
    expect(r.downstream[0]).toMatchObject({ callers: expect.any(Array), endpoints: expect.any(Array) });
    expect(r.downstream[0]!.callers).toHaveLength(20);
    expect(r.downstream[0]!.endpoints).toHaveLength(20);
    expect(r.downstream[0]!.crons).toHaveLength(20);
    expect(r.other_endpoints).toHaveLength(50);
    for (const cut of ['50 of 56 symbols', '20 of 25 callers of hot', '20 of 21 endpoints of hot', '20 of 22 cron jobs of hot', '50 of 51 other endpoints']) {
      expect(r.truncated).toContain(cut);
    }
  });

  it('other_endpoints only when non-empty; note when there are no callers', () => {
    expect(formatBlastRadius(base(), O)).not.toHaveProperty('other_endpoints');
    expect(formatBlastRadius(base(), O).note).toContain('No downstream callers');
    expect(formatBlastRadius(base({ unattributed_endpoints: ['GET /x'] }), O).other_endpoints).toEqual(['GET /x']);
  });

  it('next differs for flag_off vs other degraded reasons', () => {
    const off = formatBlastRadius(base({ degraded: true, reason: 'flag_off' }), O);
    const other = formatBlastRadius(base({ degraded: true, reason: 'index_partial' }), O);
    expect(off.next).toContain('REPO_INTEL_ENABLED');
    expect(other.next).toContain('Resync index');
    expect(formatBlastRadius(base(), O).next).toBeUndefined();
  });
});
