// src/format/text.ts — ring 1: pure text helpers. No imports, no I/O.

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;

/**
 * Strips control characters (except space), collapses whitespace, trims,
 * and cuts at `max` characters with a trailing "…" when it does.
 */
// Invisible "format" code points (Unicode category Cf): zero-width chars, bidi
// overrides/isolates, BOM and the U+E0000 tag block ("ASCII smuggling"). They
// let untrusted PR text carry instructions a human cannot see, so drop them.
const INVISIBLE_CHARS = /\p{Cf}/gu;

export function clip(text: string, max: number): string {
  const cleaned = text.replace(INVISIBLE_CHARS, '').replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();
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
  // Cut at the first non-empty line BEFORE collapsing whitespace, otherwise the
  // newline boundary is gone.
  const firstLine = withoutHeadings.split('\n').map((l) => l.trim()).find((l) => l !== '') ?? '';
  const normalized = firstLine.replace(/\s+/g, ' ').trim();
  const periodIdx = normalized.indexOf('. ');
  return periodIdx >= 0 ? normalized.slice(0, periodIdx + 1) : normalized;
}
