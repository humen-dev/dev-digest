import { DIFF_CONTEXT_LINES } from '../constants.js';

/**
 * `unifiedDiff` — classic LCS line-diff rendered as unified-diff patch text,
 * consumable by the client's existing `parsePatch` (@@ -a,b +c,d @@ hunks,
 * ` `/`+`/`-` prefixed lines). Pure, no dependencies — the diff ALGORITHM is
 * the thing under test here, so it stays out of the client's rendering path.
 */

export interface UnifiedDiffLabels {
  oldLabel: string;
  newLabel: string;
}

type OpKind = 'equal' | 'del' | 'add';
interface Op {
  type: OpKind;
  text: string;
}

/** Identical bodies → empty patch (nothing to render). */
export function unifiedDiff(oldText: string, newText: string, labels: UnifiedDiffLabels): string {
  if (oldText === newText) return '';

  const ops = lcsOps(splitLines(oldText), splitLines(newText));
  const hunks = buildHunks(ops);
  if (hunks.length === 0) return '';

  const header = `--- ${labels.oldLabel}\n+++ ${labels.newLabel}`;
  return [header, ...hunks.map(renderHunk)].join('\n');
}

function splitLines(text: string): string[] {
  return text.length === 0 ? [] : text.split('\n');
}

/**
 * Longest-common-subsequence line diff (O(n·m) DP — fine for skill-body-sized
 * documents). Walks the DP table from the front so ties prefer emitting a
 * deletion before an insertion, matching the common diff convention.
 */
function lcsOps(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: 'equal', text: a[i]! });
      i += 1;
      j += 1;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      ops.push({ type: 'del', text: a[i]! });
      i += 1;
    } else {
      ops.push({ type: 'add', text: b[j]! });
      j += 1;
    }
  }
  while (i < n) {
    ops.push({ type: 'del', text: a[i]! });
    i += 1;
  }
  while (j < m) {
    ops.push({ type: 'add', text: b[j]! });
    j += 1;
  }
  return ops;
}

interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  ops: Op[];
}

/** Group changed ops (+/- `DIFF_CONTEXT_LINES` of context) into hunks, merging nearby changes. */
function buildHunks(ops: Op[]): Hunk[] {
  const changeIdxs: number[] = [];
  ops.forEach((op, idx) => {
    if (op.type !== 'equal') changeIdxs.push(idx);
  });
  if (changeIdxs.length === 0) return [];

  const groups: number[][] = [[changeIdxs[0]!]];
  for (let k = 1; k < changeIdxs.length; k += 1) {
    const idx = changeIdxs[k]!;
    const current = groups[groups.length - 1]!;
    if (idx - current[current.length - 1]! <= DIFF_CONTEXT_LINES * 2) {
      current.push(idx);
    } else {
      groups.push([idx]);
    }
  }

  return groups.map((group) => {
    const first = group[0]!;
    const last = group[group.length - 1]!;
    const start = Math.max(0, first - DIFF_CONTEXT_LINES);
    const end = Math.min(ops.length - 1, last + DIFF_CONTEXT_LINES);
    const hunkOps = ops.slice(start, end + 1);

    let oldStart = 1;
    let newStart = 1;
    for (let idx = 0; idx < start; idx += 1) {
      if (ops[idx]!.type !== 'add') oldStart += 1;
      if (ops[idx]!.type !== 'del') newStart += 1;
    }

    let oldLines = 0;
    let newLines = 0;
    for (const op of hunkOps) {
      if (op.type !== 'add') oldLines += 1;
      if (op.type !== 'del') newLines += 1;
    }

    return { oldStart, oldLines, newStart, newLines, ops: hunkOps };
  });
}

function renderHunk(h: Hunk): string {
  const header = `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`;
  const body = h.ops
    .map((op) => `${op.type === 'equal' ? ' ' : op.type === 'del' ? '-' : '+'}${op.text}`)
    .join('\n');
  return `${header}\n${body}`;
}
