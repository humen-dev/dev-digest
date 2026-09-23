/**
 * Near-duplicate detection for rules — normalized-token Jaccard. Cheap and
 * deterministic; used to drop a candidate that restates a rule already in the
 * batch or already accepted/rejected by the maintainer.
 */

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'by', 'from',
  'is', 'are', 'be', 'as', 'at', 'it', 'its', 'this', 'that', 'use', 'uses', 'using',
  'always', 'never', 'should', 'must', 'all', 'every', 'each', 'instead', 'via', 'into',
]);

/** Lowercased content tokens: punctuation/backticks dropped, stopwords removed, plural `s` stripped. */
export function ruleTokens(rule: string): Set<string> {
  const tokens = rule
    .toLowerCase()
    .replace(/[`'"()[\]{}<>.,;:!?/\\|*+=&^%$#@~-]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !STOPWORDS.has(t))
    .map((t) => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t));
  return new Set(tokens);
}

export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

export function isSameRule(a: string, b: string, threshold: number): boolean {
  return jaccard(ruleTokens(a), ruleTokens(b)) >= threshold;
}

/**
 * Keep the first of each group of near-duplicates. `candidates` must already be
 * in priority order (highest confidence first); `decidedRules` are rules the
 * maintainer accepted or rejected — anything close to them is dropped.
 */
export function dedupeCandidates<T extends { rule: string }>(
  candidates: readonly T[],
  decidedRules: readonly string[],
  threshold: number,
): { kept: T[]; droppedDuplicate: number } {
  const seen = decidedRules.map(ruleTokens);
  const kept: T[] = [];
  let droppedDuplicate = 0;
  for (const c of candidates) {
    const tokens = ruleTokens(c.rule);
    if (seen.some((s) => jaccard(tokens, s) >= threshold)) {
      droppedDuplicate++;
      continue;
    }
    seen.push(tokens);
    kept.push(c);
  }
  return { kept, droppedDuplicate };
}
