/**
 * Pure text-shaping rules for model-written tour text (SPEC-03 AC-53,
 * AC-14). No I/O.
 */

const ELLIPSIS = '…';

/**
 * AC-53: cuts `text` to `limit` characters, ending in "…" when it was cut —
 * the result is exactly `limit` characters long in that case.
 */
export function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  if (limit <= 0) return ELLIPSIS.slice(0, Math.max(limit, 0));
  return text.slice(0, limit - 1) + ELLIPSIS;
}

/**
 * AC-14: the single-backtick inline code spans of `overview` that equal a
 * tracked file, in first-appearance order, deduplicated.
 */
export function markOverviewPaths(overview: string, tracked: ReadonlySet<string>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const match of overview.matchAll(/`(?<span>[^`\n]+)`/g)) {
    const span = match.groups?.span;
    if (span !== undefined && tracked.has(span) && !seen.has(span)) {
      seen.add(span);
      result.push(span);
    }
  }
  return result;
}
