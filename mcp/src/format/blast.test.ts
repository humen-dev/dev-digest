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
