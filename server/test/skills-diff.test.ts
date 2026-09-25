import { describe, it, expect } from 'vitest';
import { unifiedDiff } from '../src/modules/skills/domain/diff.js';

/**
 * `unifiedDiff` — LCS line-diff rendered as unified-diff text. Covers
 * insertion / deletion / change, the identical-bodies → empty-patch case,
 * and that the output is readable by the client's `parsePatch` (hunk header
 * shape + ` `/`+`/`-` line prefixes).
 */

const HUNK_HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@$/;

describe('unifiedDiff', () => {
  it('returns an empty patch for identical bodies', () => {
    expect(unifiedDiff('same\ntext', 'same\ntext', { oldLabel: 'v1', newLabel: 'current' })).toBe('');
  });

  it('renders a pure insertion', () => {
    const patch = unifiedDiff('line1\nline2', 'line1\nline2\nline3', {
      oldLabel: 'v1',
      newLabel: 'current',
    });
    expect(patch).toContain('--- v1');
    expect(patch).toContain('+++ current');
    expect(patch).toContain('+line3');
    expect(patch).not.toContain('-line1');
    expect(patch).not.toContain('-line2');
  });

  it('renders a pure deletion', () => {
    const patch = unifiedDiff('line1\nline2\nline3', 'line1\nline3', {
      oldLabel: 'v1',
      newLabel: 'current',
    });
    expect(patch).toContain('-line2');
    expect(patch).not.toContain('+line2');
  });

  it('renders a change as a deletion + insertion pair', () => {
    const patch = unifiedDiff('Coverage: 80%', 'Coverage: 95%', {
      oldLabel: 'v1',
      newLabel: 'current',
    });
    expect(patch).toContain('-Coverage: 80%');
    expect(patch).toContain('+Coverage: 95%');
  });

  it('produces hunk headers matching the shape the client\'s parsePatch expects', () => {
    const patch = unifiedDiff('a\nb\nc\nd\ne', 'a\nb\nX\nd\ne', { oldLabel: 'v1', newLabel: 'current' });
    const hunkLines = patch.split('\n').filter((l) => l.startsWith('@@'));
    expect(hunkLines.length).toBeGreaterThan(0);
    for (const line of hunkLines) expect(line).toMatch(HUNK_HEADER_RE);
  });

  it('is readable by a parsePatch-equivalent line walker (old/new line numbers advance correctly)', () => {
    const patch = unifiedDiff('keep1\nold\nkeep2', 'keep1\nnew\nkeep2', {
      oldLabel: 'v1',
      newLabel: 'current',
    });
    const lines = patch.split('\n');
    let oldNo = 0;
    let newNo = 0;
    const seen: { kind: string; text: string; oldNo?: number; newNo?: number }[] = [];
    for (const raw of lines) {
      if (raw.startsWith('---') || raw.startsWith('+++')) continue;
      if (raw.startsWith('@@')) {
        const m = raw.match(HUNK_HEADER_RE);
        expect(m).not.toBeNull();
        oldNo = parseInt(m![1]!, 10);
        newNo = parseInt(m![3]!, 10);
        continue;
      }
      if (raw.startsWith('+')) {
        seen.push({ kind: 'add', text: raw.slice(1), newNo });
        newNo += 1;
      } else if (raw.startsWith('-')) {
        seen.push({ kind: 'del', text: raw.slice(1), oldNo });
        oldNo += 1;
      } else {
        seen.push({ kind: 'ctx', text: raw.slice(1), oldNo, newNo });
        oldNo += 1;
        newNo += 1;
      }
    }
    expect(seen).toEqual([
      { kind: 'ctx', text: 'keep1', oldNo: 1, newNo: 1 },
      { kind: 'del', text: 'old', oldNo: 2 },
      { kind: 'add', text: 'new', newNo: 2 },
      { kind: 'ctx', text: 'keep2', oldNo: 3, newNo: 3 },
    ]);
  });

  it('handles an empty old body (new skill body from nothing)', () => {
    const patch = unifiedDiff('', 'hello', { oldLabel: 'v1', newLabel: 'current' });
    expect(patch).toContain('+hello');
  });

  it('handles an empty new body', () => {
    const patch = unifiedDiff('hello', '', { oldLabel: 'v1', newLabel: 'current' });
    expect(patch).toContain('-hello');
  });
});
