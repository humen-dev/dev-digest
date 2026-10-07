import type { HunkRange } from '../types.js';

// Only the `@@ -a,b +c,d @@` header is ever inspected; diff body text is never read or returned.
const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

/** New-side line ranges `[c, c+d-1]` of every hunk in a unified-diff patch. `d` omitted => 1, `d = 0` => no range. */
export function parseHunkRanges(patch: string | null): HunkRange[] {
  if (!patch) return [];
  const ranges: HunkRange[] = [];
  for (const line of patch.split('\n')) {
    if (!line.startsWith('@@')) continue;
    const m = HUNK_HEADER.exec(line);
    if (!m) continue;
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    if (count <= 0) continue;
    ranges.push([start, start + count - 1]);
  }
  return ranges;
}

export function lineInRanges(line: number, ranges: readonly HunkRange[]): boolean {
  return ranges.some(([start, end]) => line >= start && line <= end);
}
