import { describe, it, expect } from 'vitest';
import {
  buildHistoryQuery,
  buildHistoryVariables,
  isRateLimited,
  parseHistoryResponse,
} from '../src/adapters/github/pr-history.js';

describe('pr-history adapter (pure helpers, no network)', () => {
  it('builds a query with path variables only', () => {
    const paths = ['src/secret-path.ts', 'a"b{c}.ts'];
    const q = buildHistoryQuery(paths.length);
    expect(q).toContain('$p0: String!');
    expect(q).toContain('$p1: String!');
    expect(q).toContain('f1: history(first: $n, path: $p1)');
    for (const p of paths) expect(q).not.toContain(p);
    const vars = buildHistoryVariables({ owner: 'o', name: 'n', ref: 'main', paths, commitsPerPath: 10 });
    expect(vars).toMatchObject({ owner: 'o', name: 'n', ref: 'main', n: 10, k: 3, p0: paths[0], p1: paths[1] });
  });

  it('parses null repository/object and dedupes PRs per path', () => {
    expect(parseHistoryResponse({ repository: null }, ['a'])).toEqual([]);
    expect(parseHistoryResponse({ repository: { object: null } }, ['a'])).toEqual([]);
    const pr = { number: 4, title: 'T', mergedAt: '2026-01-01T00:00:00Z', author: { login: 'bob' } };
    const data = {
      repository: {
        object: {
          f0: { nodes: [{ associatedPullRequests: { nodes: [pr, pr, null] } }, null] },
          f1: {
            nodes: [{ associatedPullRequests: { nodes: [{ number: 7, title: 'X', mergedAt: null, author: null }] } }],
          },
        },
      },
    };
    expect(parseHistoryResponse(data, ['a', 'b'])).toEqual([
      { path: 'a', prs: [{ number: 4, title: 'T', mergedAt: '2026-01-01T00:00:00Z', author: 'bob' }] },
      { path: 'b', prs: [{ number: 7, title: 'X', mergedAt: null, author: 'unknown' }] },
    ]);
  });

  it('isRateLimited truth table', () => {
    expect(isRateLimited({ status: 429 })).toBe(true);
    expect(isRateLimited({ status: 403, response: { headers: { 'x-ratelimit-remaining': '0' } } })).toBe(true);
    expect(isRateLimited({ status: 403, response: { headers: { 'x-ratelimit-remaining': '12' } } })).toBe(false);
    expect(isRateLimited({ errors: [{ type: 'RATE_LIMITED' }] })).toBe(true);
    expect(isRateLimited({ errors: [{ type: 'NOT_FOUND' }] })).toBe(false);
    expect(isRateLimited({ status: 500 })).toBe(false);
    expect(isRateLimited(null)).toBe(false);
  });
});
