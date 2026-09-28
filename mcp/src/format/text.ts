// src/format/text.ts — ring 1: pure text helpers. No imports, no I/O.

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;

/**
 * Strips control characters (except space), collapses whitespace, trims,
 * and cuts at `max` characters with a trailing "…" when it does.
 */
export function clip(text: string, max: number): string {
  const cleaned = text.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/**
 * Returns the first sentence of a markdown string: strips code fences,
 * inline backticks and heading markers, then cuts at the first ". " or newline.
 */
export function firstSentence(md: string): string {
  const withoutFences = md.replace(/```[\s\S]*?```/g, ' ');
  const withoutInlineCode = withoutFences.replace(/`([^`]*)`/g, '$1');
  const withoutHeadings = withoutInlineCode.replace(/^#+\s*/gm, '');
  const normalized = withoutHeadings.replace(/\s+/g, ' ').trim();
  const newlineIdx = normalized.indexOf('\n');
  const periodIdx = normalized.indexOf('. ');
  const candidates = [newlineIdx, periodIdx].filter((i) => i >= 0);
  if (candidates.length === 0) return normalized;
  const cut = Math.min(...candidates);
  const endsAtPeriod = cut === periodIdx;
  return normalized.slice(0, endsAtPeriod ? cut + 1 : cut).trim();
}
