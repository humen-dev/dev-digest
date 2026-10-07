import { describe, it, expect } from 'vitest';
import { parseHunkRanges, lineInRanges } from '../src/modules/brief/domain/hunks.js';

describe('parseHunkRanges', () => {
  it.each([
    ['@@ -1,2 +10,3 @@ fn', [[10, 12]]],
    ['@@ -1 +7 @@', [[7, 7]]],
    ['@@ -5,2 +5,0 @@', []],
    ['@@ -1,2 +1,2 @@\n a\n@@ -20,1 +30,4 @@\n b', [[1, 2], [30, 33]]],
  ])('parses %j', (patch, expected) => {
    expect(parseHunkRanges(patch)).toEqual(expected);
  });

  it('returns [] for null / empty patch', () => {
    expect(parseHunkRanges(null)).toEqual([]);
    expect(parseHunkRanges('')).toEqual([]);
  });

  it('never returns body text', () => {
    const out = parseHunkRanges('@@ -1,1 +1,1 @@ SECRET_HEADER_CTX\n+const SECRET = "x";\n@@ not a header SECRET');
    expect(JSON.stringify(out)).not.toContain('SECRET');
    expect(out).toEqual([[1, 1]]);
  });
});

describe('lineInRanges', () => {
  it('is inclusive on both ends', () => {
    expect(lineInRanges(3, [[3, 5]])).toBe(true);
    expect(lineInRanges(5, [[3, 5]])).toBe(true);
    expect(lineInRanges(6, [[3, 5]])).toBe(false);
    expect(lineInRanges(1, [])).toBe(false);
  });
});
