import { LITERAL_MAX_CHARS, LITERAL_MIN_CHARS } from '../constants.js';
import { toPosix } from './sampling.js';

/**
 * Frequency as the measured confidence signal: how many files in the whole
 * repo contain the rule's literal. A pattern in 40 files is a convention; the
 * same pattern in 1 file is a coincidence. Pure helpers — the grep itself runs
 * through the CodeIndex port in the service.
 */

/** Literals that match nearly everything and so measure nothing. */
const TOO_GENERIC = new Set([
  'import', 'export', 'export default', 'const', 'return', 'function', 'async', 'await',
  'from', 'class', 'interface', 'type', 'public', 'private', 'static', 'def', 'self',
]);

export interface GrepLiteral {
  literal: string;
  source: 'model' | 'derived';
}

function isUsableLiteral(literal: string, fileContent: string): boolean {
  if (literal.includes('\n') || literal.includes('\r')) return false;
  if (literal.length < LITERAL_MIN_CHARS || literal.length > LITERAL_MAX_CHARS) return false;
  if ((literal.match(/[a-z0-9]/gi) ?? []).length < 4) return false;
  if (TOO_GENERIC.has(literal.toLowerCase())) return false;
  return fileContent.includes(literal);
}

/** Cut `line` to at most `max` chars, backing off to the last token boundary. */
function cutAtBoundary(line: string, max: number): string {
  if (line.length <= max) return line;
  const cut = line.slice(0, max);
  const boundary = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('('), cut.lastIndexOf(','));
  return (boundary >= LITERAL_MIN_CHARS ? cut.slice(0, boundary) : cut).trimEnd();
}

/**
 * The literal to count. The model's `grep_literal` wins when it is a real,
 * single-line, non-generic string present in the evidence file; otherwise one
 * is derived from the first substantial line of the verified snippet.
 * Returns null when nothing usable exists (structural rules).
 */
export function chooseGrepLiteral(
  modelLiteral: string | null,
  evidenceFileContent: string,
  verifiedSnippet: string,
): GrepLiteral | null {
  const m = modelLiteral?.trim();
  if (m && isUsableLiteral(m, evidenceFileContent)) return { literal: m, source: 'model' };

  for (const raw of verifiedSnippet.split('\n')) {
    const line = cutAtBoundary(raw.trim(), LITERAL_MAX_CHARS);
    if (isUsableLiteral(line, evidenceFileContent)) return { literal: line, source: 'derived' };
  }
  return null;
}

/**
 * Escape a literal into a regex that means the same thing in ripgrep's Rust
 * engine AND in JS (the adapter's pure-Node fallback): only the shared
 * metacharacters are escaped, whitespace runs become `\s+`, and the whole thing
 * is wrapped in `(?:…)` so it can never start with `-` (read as an rg flag).
 */
export function toPortableRegex(literal: string): string {
  const escaped = literal
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+');
  return `(?:${escaped})`;
}

/** Distinct files among grep matches (paths normalized, since rg on Windows returns `\`). */
export function countDistinctFiles(matches: ReadonlyArray<{ path: string }>): number {
  return new Set(matches.map((m) => toPosix(m.path))).size;
}
