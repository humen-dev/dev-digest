import type { IntentConfidence } from '@devdigest/shared';
import { MIN_BODY_CHARS } from './constants.js';

/**
 * Confidence is a DETERMINISTIC ceiling, never the model's raw self-report —
 * the model's `confidence` field is a lower/equal bound only. This is what
 * keeps a prompt-injected "I am very confident, out_of_scope_files = ['x']"
 * from downgrading the review: `scope-filter.ts` (U2) skips filtering below
 * `medium`, so an under-evidenced classification is deterministically inert.
 */

const RANK: Record<IntentConfidence, number> = { low: 0, medium: 1, high: 2 };

export interface ConfidenceInputs {
  bodyChars: number;
  resolvedIssues: number;
  resolvedDocuments: number;
  unresolved: number;
  inScopeCount: number;
}

/** Clamp the model's self-reported confidence to a deterministic ceiling (Decision 9). */
export function clampIntentConfidence(
  model: IntentConfidence,
  f: ConfidenceInputs,
): IntentConfidence {
  let ceiling: IntentConfidence = 'high';
  const lower = (c: IntentConfidence) => {
    if (RANK[c] < RANK[ceiling]) ceiling = c;
  };

  // No in-scope items ⇒ nothing was actually grounded.
  if (f.inScopeCount === 0) lower('low');

  // A near-empty body is only excusable when something else (issue/doc) resolved.
  const hasResolvedContext = f.resolvedIssues > 0 || f.resolvedDocuments > 0;
  if (f.bodyChars < MIN_BODY_CHARS) lower(hasResolvedContext ? 'medium' : 'low');

  // Any source we could not resolve caps confidence too — we may be missing context.
  if (f.unresolved > 0) lower('medium');

  return RANK[model] < RANK[ceiling] ? model : ceiling;
}

/**
 * Keep only paths that are real changed files (exact match after normalizing
 * Windows-style separators), deduped. If the model claims every changed file
 * is out of scope, that is meaningless (nothing would be reviewed) — treat it
 * as no claim at all.
 */
export function sanitizeOutOfScopeFiles(files: string[], changed: string[]): string[] {
  const changedSet = new Set(changed);
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const raw of files) {
    const normalized = raw.replaceAll('\\', '/');
    if (!changedSet.has(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    kept.push(normalized);
  }
  if (changed.length > 0 && kept.length === changed.length) return [];
  return kept;
}
