import { describe, it, expect } from 'vitest';
import { PrHistoryItem } from '@devdigest/shared';
import { buildPrHistory } from '../src/modules/pr-history/domain/build-history.js';
import type { PathPrHits } from '../src/modules/pr-history/ports.js';

const pr = (number: number, mergedAt: string | null, author = 'alice') => ({
  number,
  title: `PR ${number}`,
  mergedAt,
  author,
});

describe('buildPrHistory', () => {
  it('drops the current PR and unmerged entries, merges overlap, sorts and caps', () => {
    const hits: PathPrHits[] = [
      { path: 'b.ts', prs: [pr(1, '2026-01-01T00:00:00Z'), pr(9, '2026-05-01T00:00:00Z'), pr(5, null)] },
      {
        path: 'a.ts',
        prs: [pr(1, '2026-01-01T00:00:00Z'), pr(2, '2026-03-01T00:00:00Z'), pr(3, '2026-03-01T00:00:00Z', '')],
      },
    ];
    const items = buildPrHistory(hits, { currentNumber: 9, maxItems: 10 });
    // overlap 2 first; then date desc; tie → number desc
    expect(items.map((i) => i.pr_number)).toEqual([1, 3, 2]);
    expect(items[0]!.files_overlap).toEqual(['a.ts', 'b.ts']);
    expect(items[1]!.author).toBe('unknown');
    expect(items.every((i) => i.notes === '')).toBe(true);
    for (const i of items) PrHistoryItem.parse(i);
    expect(buildPrHistory(hits, { currentNumber: 9, maxItems: 2 })).toHaveLength(2);
  });

  it('returns [] for no hits', () => {
    expect(buildPrHistory([], { currentNumber: 1, maxItems: 5 })).toEqual([]);
  });
});
