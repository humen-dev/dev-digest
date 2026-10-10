import { groundFindings } from '@devdigest/reviewer-core';
import type { EvalExpectation, Finding, UnifiedDiff } from '@devdigest/shared';

const DIFF_HEADER = 'diff --git ';

/** Path of a `diff --git a/<p> b/<p>` header when both sides name the same file. */
function pathFromGitHeader(line: string): string | null {
  const rest = line.slice(DIFF_HEADER.length);
  if (!rest.startsWith('a/')) return null;
  const body = rest.slice(2); // `<p> b/<p>`
  const half = (body.length - 3) / 2;
  if (!Number.isInteger(half) || half < 1) return null;
  const p = body.slice(0, half);
  return body.slice(half) === ` b/${p}` ? p : null;
}

function stripTimestamp(p: string): string {
  const tab = p.indexOf('\t');
  return (tab === -1 ? p : p.slice(0, tab)).replace(/\r$/, '');
}

/** The path a section of a unified diff refers to (new side, falling back to the old side / header). */
function sectionPath(section: string[]): string | null {
  let oldPath: string | null = null;
  for (const line of section) {
    if (line.startsWith('+++ b/')) return stripTimestamp(line.slice(6));
    if (line.startsWith('--- a/')) oldPath = stripTimestamp(line.slice(6));
    if (line.startsWith('@@')) break;
  }
  if (oldPath) return oldPath;
  const first = section[0];
  return first && first.startsWith(DIFF_HEADER) ? pathFromGitHeader(first.replace(/\r$/, '')) : null;
}

/** Splits a raw diff into per-file sections, keeping every line. */
function splitSections(raw: string): string[][] {
  const lines = raw.split('\n');
  const hasGitHeaders = lines.some((l) => l.startsWith(DIFF_HEADER));
  const sections: string[][] = [];
  let current: string[] | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    const startsSection = hasGitHeaders
      ? line.startsWith(DIFF_HEADER)
      : line.startsWith('--- ') && (lines[i + 1] ?? '').startsWith('+++ ');
    if (startsSection) {
      current = [];
      sections.push(current);
    }
    if (current) current.push(line);
  }
  return sections;
}

/**
 * The part of `raw` that belongs to `path` (all of its hunks), or `null` when
 * the file is absent. Matches the path exactly (never by substring), unlike
 * reviewer-core `sliceDiff`.
 */
export function extractFileDiff(raw: string, path: string): string | null {
  for (const section of splitSections(raw)) {
    if (sectionPath(section) === path) return section.join('\n');
  }
  return null;
}

/** UTF-8 size of a diff text, in bytes (compared to `EVAL_MAX_FROZEN_DIFF_BYTES`). */
export function diffByteSize(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

/**
 * True when the expectation's range intersects a hunk of its file in `diff`.
 * Reuses the engine's grounding gate with a synthetic `kind: 'finding'`, so a
 * range that originated from a full-file kind still needs a line intersection.
 */
export function expectationIntersectsHunk(diff: UnifiedDiff, e: EvalExpectation): boolean {
  const probe: Finding = {
    id: 'eval-expectation',
    severity: 'SUGGESTION',
    category: 'bug',
    title: 'eval expectation',
    file: e.file,
    start_line: e.start_line,
    end_line: e.end_line,
    rationale: '',
    confidence: 1,
    kind: 'finding',
  };
  return groundFindings([probe], diff).kept.length > 0;
}
