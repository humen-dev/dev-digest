import { ConventionCategory } from '@devdigest/shared';
import { MIN_SNIPPET_CHARS, SNIPPET_MAX_LINES } from '../constants.js';
import type { ProposedCandidate, VerifiedCandidate } from '../types.js';
import { isSafeRelativePath, toPosix } from './sampling.js';

/**
 * The evidence gate — code, not a second model. A candidate survives only if
 * the file it cites was sampled and the snippet it quotes is actually in that
 * file. The kept path, line and snippet are taken FROM THE FILE, never from
 * the model: a model is good at noticing a pattern and bad at remembering
 * where it saw it.
 */

export type GateFailure = 'unknown_path' | 'snippet_too_short' | 'snippet_not_found' | 'empty_rule';

export type GateResult =
  | { ok: true; candidate: VerifiedCandidate }
  | { ok: false; reason: GateFailure };

/**
 * Map a model-cited path onto one of the sampled paths: exact match, or a
 * UNIQUE suffix match on a `/` boundary (`./src/a.ts`, `a.ts`, `repo/src/a.ts`).
 * Ambiguity returns null — guessing would defeat the gate.
 */
export function resolveEvidencePath(claimed: string, sampledPaths: readonly string[]): string | null {
  let c = toPosix(claimed.trim());
  while (c.startsWith('./')) c = c.slice(2);
  if (!isSafeRelativePath(c)) return null;

  const exact = sampledPaths.find((s) => toPosix(s) === c);
  if (exact) return exact;

  const matches = sampledPaths.filter((s) => {
    const sp = toPosix(s);
    return sp.endsWith(`/${c}`) || c.endsWith(`/${sp}`);
  });
  return matches.length === 1 ? matches[0]! : null;
}

const GUTTER_LINE = /^\s*\d+\s*[│|]\s?/;

/** Remove a copied line-number gutter (` 12 │ code`) — only when EVERY non-empty line has one. */
export function stripGutter(snippet: string): string {
  const lines = snippet.split(/\r?\n/);
  const nonEmpty = lines.filter((l) => l.trim() !== '');
  if (nonEmpty.length === 0 || !nonEmpty.every((l) => GUTTER_LINE.test(l))) return snippet;
  return lines.map((l) => l.replace(GUTTER_LINE, '')).join('\n');
}

function nonSpaceLength(s: string): number {
  return s.replace(/\s+/g, '').length;
}

/**
 * Find `snippet` in `content`, ignoring all whitespace (indentation, wrapping,
 * CRLF). Case-sensitive: code is. When the snippet occurs more than once, the
 * hit nearest `claimedLine` wins. Returns 1-based inclusive line numbers.
 */
export function locateSnippet(
  content: string,
  snippet: string,
  claimedLine: number | null,
): { startLine: number; endLine: number } | null {
  const needle = snippet.replace(/\s+/g, '');
  if (!needle) return null;

  const lines = content.split(/\r?\n/);
  const chars: string[] = [];
  const lineOf: number[] = [];
  lines.forEach((line, i) => {
    // Iterate UTF-16 units (not code points) so `lineOf` indices line up with `indexOf` offsets.
    for (let k = 0; k < line.length; k++) {
      const ch = line[k]!;
      if (/\s/.test(ch)) continue;
      chars.push(ch);
      lineOf.push(i + 1);
    }
  });
  const haystack = chars.join('');

  let best: { startLine: number; endLine: number } | null = null;
  let bestDistance = Infinity;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + 1)) {
    const hit = { startLine: lineOf[at]!, endLine: lineOf[at + needle.length - 1]! };
    const distance = claimedLine == null ? 0 : Math.abs(hit.startLine - claimedLine);
    if (distance < bestDistance) {
      best = hit;
      bestDistance = distance;
      if (distance === 0) break;
    }
  }
  return best;
}

/** Remove the common leading indentation so a snippet cut from deep inside a file reads cleanly. */
export function dedent(text: string): string {
  const lines = text.split('\n');
  const indents = lines
    .filter((l) => l.trim() !== '')
    .map((l) => (l.match(/^[ \t]*/) ?? [''])[0].length);
  const min = indents.length ? Math.min(...indents) : 0;
  return min ? lines.map((l) => l.slice(min)).join('\n') : text;
}

/** Slice lines `[start, end]` (1-based, inclusive) out of `content`, capped and dedented. */
export function sliceLines(content: string, startLine: number, endLine: number): string {
  const lines = content.split(/\r?\n/);
  const end = Math.min(endLine, startLine + SNIPPET_MAX_LINES - 1);
  return dedent(lines.slice(startLine - 1, end).join('\n'));
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * Run one model candidate through the gate against the files the model saw
 * (`files`: sampled path → the exact content that was rendered).
 */
export function verifyCandidate(c: ProposedCandidate, files: ReadonlyMap<string, string>): GateResult {
  const rule = c.rule.trim();
  if (!rule) return { ok: false, reason: 'empty_rule' };

  const path = resolveEvidencePath(c.evidence_path, [...files.keys()]);
  if (!path) return { ok: false, reason: 'unknown_path' };

  const snippet = stripGutter(c.evidence_snippet);
  if (nonSpaceLength(snippet) < MIN_SNIPPET_CHARS) return { ok: false, reason: 'snippet_too_short' };

  const content = files.get(path)!;
  const hit = locateSnippet(content, snippet, c.evidence_line);
  if (!hit) return { ok: false, reason: 'snippet_not_found' };

  const category = ConventionCategory.safeParse(c.category);
  const rationale = c.rationale?.trim() || null;
  return {
    ok: true,
    candidate: {
      rule,
      rationale,
      category: category.success ? category.data : 'other',
      confidence: clamp01(c.confidence),
      evidencePath: path,
      evidenceLine: hit.startLine,
      evidenceSnippet: sliceLines(content, hit.startLine, hit.endLine),
      grepLiteral: c.grep_literal?.trim() || null,
      occurrences: null,
    },
  };
}
