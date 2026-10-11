import { describe, it, expect } from 'vitest';
import type { UnifiedDiff } from '@devdigest/shared';
import {
  diffByteSize,
  expectationIntersectsHunk,
  extractFileDiff,
} from '../src/modules/eval/domain/frozen-input.js';
import { EVAL_MAX_FROZEN_DIFF_BYTES } from '../src/modules/eval/constants.js';

const fileA = [
  'diff --git a/src/a.ts b/src/a.ts',
  'index 111..222 100644',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,2 +1,3 @@',
  ' one',
  '+two',
  ' three',
  '@@ -20,1 +21,2 @@',
  ' x',
  '+y',
];
const fileB = [
  'diff --git a/src/a.ts.bak b/src/a.ts.bak',
  '--- a/src/a.ts.bak',
  '+++ b/src/a.ts.bak',
  '@@ -1 +1 @@',
  '-old',
  '+new',
];
const raw = [...fileB, ...fileA].join('\n') + '\n';

const diff: UnifiedDiff = {
  raw,
  files: [
    {
      path: 'src/a.ts',
      additions: 2,
      deletions: 0,
      hunks: [
        { file: 'src/a.ts', oldStart: 1, oldLines: 2, newStart: 1, newLines: 3, newLineNumbers: [1, 2, 3] },
        { file: 'src/a.ts', oldStart: 20, oldLines: 1, newStart: 21, newLines: 2, newLineNumbers: [21, 22] },
      ],
    },
  ],
};
const exp = (start_line: number, end_line: number, file = 'src/a.ts') =>
  ({ type: 'must_find', file, start_line, end_line }) as const;

describe('extractFileDiff', () => {
  it('returns only the requested file with all its hunks (exact path match)', () => {
    const out = extractFileDiff(raw, 'src/a.ts');
    expect(out).not.toBeNull();
    expect(out).toContain('@@ -1,2 +1,3 @@');
    expect(out).toContain('@@ -20,1 +21,2 @@');
    expect(out).not.toContain('a.ts.bak');
    expect(out).not.toContain('-old');
  });

  it('returns null for an absent file', () => {
    expect(extractFileDiff(raw, 'src/missing.ts')).toBeNull();
    expect(extractFileDiff(raw, 'a.ts')).toBeNull();
  });

  it('handles diffs without git headers and deleted files', () => {
    const plain = ['--- a/x.ts', '+++ b/x.ts', '@@ -1 +1 @@', '-a', '+b'].join('\n');
    expect(extractFileDiff(plain, 'x.ts')).toBe(plain);
    const deleted = [
      'diff --git a/gone.ts b/gone.ts',
      'deleted file mode 100644',
      '--- a/gone.ts',
      '+++ /dev/null',
      '@@ -1 +0,0 @@',
      '-z',
    ].join('\n');
    expect(extractFileDiff(deleted, 'gone.ts')).toBe(deleted);
  });
});

describe('expectationIntersectsHunk', () => {
  it('is true inside a hunk and false outside every hunk', () => {
    expect(expectationIntersectsHunk(diff, exp(2, 2))).toBe(true);
    expect(expectationIntersectsHunk(diff, exp(3, 10))).toBe(true);
    expect(expectationIntersectsHunk(diff, exp(5, 15))).toBe(false);
    expect(expectationIntersectsHunk(diff, exp(100, 120))).toBe(false);
  });

  it('is false for a file not in the diff', () => {
    expect(expectationIntersectsHunk(diff, exp(1, 1, 'src/other.ts'))).toBe(false);
  });
});

describe('diffByteSize', () => {
  it('counts UTF-8 bytes and detects a diff over the frozen limit', () => {
    expect(diffByteSize('héllo')).toBe(6);
    const big = '+' + 'x'.repeat(201 * 1024) + '\n';
    expect(diffByteSize(big)).toBeGreaterThan(EVAL_MAX_FROZEN_DIFF_BYTES);
    expect(diffByteSize('+small\n')).toBeLessThan(EVAL_MAX_FROZEN_DIFF_BYTES);
  });
});
