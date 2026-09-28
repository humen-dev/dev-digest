import { describe, expect, it } from 'vitest';
import type { ApiConvention, ApiConventionBoard } from '../domain/types.js';
import { ToolError } from '../errors.js';
import { CONVENTION_CATEGORIES, formatConventions } from './conventions.js';

function makeConvention(over: Partial<ApiConvention> = {}): ApiConvention {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    rule: 'Use camelCase for variables.',
    category: 'naming',
    status: 'accepted',
    evidence_path: 'src/foo.ts',
    evidence_line: 12,
    occurrences: 5,
    confidence: 0.9,
    ...over,
  };
}

describe('formatConventions', () => {
  it('defaults to accepted status and limit 30, sorted by occurrences then confidence', () => {
    const candidates: ApiConvention[] = [
      makeConvention({ id: 'a', occurrences: 2, confidence: 0.9 }),
      makeConvention({ id: 'b', occurrences: 5, confidence: 0.5 }),
      makeConvention({ id: 'c', occurrences: null, confidence: 0.99 }),
      makeConvention({ id: 'd', status: 'pending' }),
    ];
    const board: ApiConventionBoard = { candidates, last_scan: { created_at: '2026-01-01T00:00:00.000Z' } };

    const result = formatConventions(board, { repo: 'acme/payments-api' });

    expect(result.status).toBe('accepted');
    expect(result.returned).toBe(3);
    expect(result.conventions.map((c) => c.evidence)).toEqual([
      'src/foo.ts:12', // b: occurrences 5
      'src/foo.ts:12', // a: occurrences 2
      'src/foo.ts:12', // c: occurrences null (last)
    ]);
    expect(result.last_scan_at).toBe('2026-01-01T00:00:00.000Z');
  });

  it('rejects an unknown category listing the 10 valid ones', () => {
    const board: ApiConventionBoard = { candidates: [], last_scan: null };
    expect(() => formatConventions(board, { repo: 'r', category: 'nonsense' })).toThrow(ToolError);
    try {
      formatConventions(board, { repo: 'r', category: 'nonsense' });
    } catch (err) {
      expect(err).toBeInstanceOf(ToolError);
      const toolErr = err as ToolError;
      for (const cat of CONVENTION_CATEGORIES) {
        expect(toolErr.message).toContain(cat);
      }
    }
  });

  it('adds a note with per-status counts when the filter matches 0 but pending rows exist', () => {
    const candidates: ApiConvention[] = [
      makeConvention({ id: 'p1', status: 'pending' }),
      makeConvention({ id: 'p2', status: 'pending' }),
      makeConvention({ id: 'r1', status: 'rejected' }),
    ];
    const board: ApiConventionBoard = { candidates, last_scan: null };

    const result = formatConventions(board, { repo: 'r' });

    expect(result.conventions).toHaveLength(0);
    expect(result.note).toContain('pending');
    expect(result.note).toMatch(/status: "pending"/);
  });

  it('truncates when more conventions match than the limit', () => {
    const candidates = Array.from({ length: 5 }, (_, i) => makeConvention({ id: `c-${i}` }));
    const board: ApiConventionBoard = { candidates, last_scan: null };

    const result = formatConventions(board, { repo: 'r', limit: 2 });

    expect(result.returned).toBe(2);
    expect(result.total_matching).toBe(5);
    expect(result.truncated).toMatch(/limit/);
  });
});
