import type { PromptInput } from '../types.js';

/**
 * Selects and shapes the files that go into the tour-generation prompt: which
 * paths are excluded / unreadable, which paths make the file tree, how a
 * file is excerpted, and how the whole `PromptInput` is trimmed to a token
 * budget. Pure — no git, no fs, no LLM; the caller (U3 adapters / U5 service)
 * supplies tracked paths, file contents and a token counter.
 */

const ENV_ALLOWED_SUFFIXES = new Set(['example', 'sample', 'template']);
const MAX_TREE_ENTRIES = 300;
const MAX_EXCERPT_LINES = 120;
const MAX_EXCERPT_LINE_CHARS = 1000;

/** True if any path segment is an excluded dir, or the file name contains `.min.`. */
export function isExcludedPath(path: string, excludedDirs: readonly string[]): boolean {
  const excluded = new Set(excludedDirs);
  const segments = path.split('/');
  if (segments.some((segment) => excluded.has(segment))) return true;
  const name = segments[segments.length - 1] ?? '';
  return name.includes('.min.');
}

/**
 * Blocks `.git/**`, `.env` (and any `.env.*` other than `.example` / `.sample`
 * / `.template`), and anything over `maxBytes` (UT-6, UT-12).
 */
export function isReadableInput(path: string, size: number, maxBytes: number): boolean {
  if (size > maxBytes) return false;
  const segments = path.split('/');
  if (segments.includes('.git')) return false;
  const name = segments[segments.length - 1] ?? '';
  if (name === '.env') return false;
  if (name.startsWith('.env.') && !ENV_ALLOWED_SUFFIXES.has(name.slice('.env.'.length))) return false;
  return true;
}

/**
 * Ranked (hot) tracked paths first, in rank order; then the rest of the
 * tracked paths in path order. Excluded paths never appear. Capped at 300
 * entries total (AC-39).
 */
export function buildFileTree(
  tracked: readonly string[],
  ranked: readonly string[],
  excludedDirs: readonly string[],
): string[] {
  const trackedSet = new Set(tracked);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const path of ranked) {
    if (result.length >= MAX_TREE_ENTRIES) break;
    if (!trackedSet.has(path) || seen.has(path) || isExcludedPath(path, excludedDirs)) continue;
    seen.add(path);
    result.push(path);
  }

  const rest = tracked
    .filter((path) => !seen.has(path) && !isExcludedPath(path, excludedDirs))
    .sort();

  for (const path of rest) {
    if (result.length >= MAX_TREE_ENTRIES) break;
    result.push(path);
  }

  return result;
}

/** First 120 lines; `null` if any line exceeds 1,000 chars (AC-41). */
export function excerptOf(text: string): string | null {
  const lines = text.split('\n');
  if (lines.some((line) => line.length > MAX_EXCERPT_LINE_CHARS)) return null;
  return lines.slice(0, MAX_EXCERPT_LINES).join('\n');
}

/**
 * Trims `input` to fit `budget` tokens (NFR-1): shortens the tree first —
 * dropping its lowest-priority (tail) entries one at a time — and only once
 * the tree is exhausted starts dropping excerpts from the lowest-ranked
 * (tail) upward. `commandFiles` are never dropped — the model needs them to
 * ground `how_to_run`.
 */
export function fitToBudget(
  input: PromptInput,
  countTokens: (i: PromptInput) => number,
  budget = 20_000,
): PromptInput {
  let result = input;

  while (countTokens(result) > budget && result.tree.length > 0) {
    result = { ...result, tree: result.tree.slice(0, -1) };
  }

  while (countTokens(result) > budget && result.excerpts.length > 0) {
    result = { ...result, excerpts: result.excerpts.slice(0, -1) };
  }

  return result;
}
