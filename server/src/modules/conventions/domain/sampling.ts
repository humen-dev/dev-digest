/**
 * Sampling policy — 100 % code, no model. Decides WHICH files the extraction
 * call sees; the model never chooses or browses.
 */

/** Layer buckets, in the order the diversity pass fills them. */
export const PATH_BUCKETS = ['test', 'route', 'service', 'data', 'hook', 'ui', 'util', 'other'] as const;
export type PathBucket = (typeof PATH_BUCKETS)[number];

const CODE_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rb|java|kt|cs|rs|php|vue|svelte|swift|scala)$/i;

const EXCLUDED = [
  /\.d\.ts$/i,
  /(^|\/)(node_modules|dist|build|out|coverage|vendor|\.next|\.nuxt|__generated__|generated)\//i,
  /(^|\/)migrations?\//i,
  /(^|\/)(__snapshots__|fixtures?)\//i,
  /\.min\.[cm]?js$/i,
  /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/i,
];

/** Forward-slash form of a repo-relative path (git/ripgrep on Windows use `\`). */
export function toPosix(path: string): string {
  return path.replaceAll('\\', '/');
}

/**
 * True when `path` is a plain repo-relative path: no absolute root, no drive
 * letter, no `..` segment, no NUL. Anything the model or the index hands us is
 * checked with this before it is joined onto the clone directory.
 */
export function isSafeRelativePath(path: string): boolean {
  if (!path || path.includes('\0')) return false;
  const p = toPosix(path);
  if (p.startsWith('/') || /^[a-zA-Z]:/.test(p)) return false;
  return !p.split('/').some((seg) => seg === '..');
}

export function isCodeFile(path: string): boolean {
  return CODE_EXT.test(path);
}

export function isExcluded(path: string): boolean {
  const p = toPosix(path);
  return EXCLUDED.some((re) => re.test(p));
}

/** Which architectural layer a file most likely belongs to. */
export function classifyPath(path: string): PathBucket {
  const original = toPosix(path);
  const p = original.toLowerCase();
  const base = p.slice(p.lastIndexOf('/') + 1);
  // Case matters for the React hook convention: `useCart.ts` is a hook, `user.ts` is not.
  const originalBase = original.slice(original.lastIndexOf('/') + 1);
  const has = (re: RegExp) => re.test(p);

  if (
    has(/(^|\/)(__tests__|tests?|spec|specs|e2e)\//) ||
    /\.(test|spec)\.[a-z]+$/.test(base) ||
    /^test_.*\.py$/.test(base) ||
    /_test\.go$/.test(base)
  ) {
    return 'test';
  }
  if (has(/(^|\/)(routes?|controllers?|handlers?|endpoints?|api)\//) || /^(routes?|route|.*\.controller|.*\.routes?)\.[a-z]+$/.test(base)) {
    return 'route';
  }
  if (has(/(^|\/)(services?|use-?cases?|application)\//) || /(^|\.)service\.[a-z]+$/.test(base)) {
    return 'service';
  }
  if (
    has(/(^|\/)(repositor(y|ies)|db|database|models?|entities|schemas?|dal|persistence)\//) ||
    /(^|\.)(repository|model|entity|schema)\.[a-z]+$/.test(base)
  ) {
    return 'data';
  }
  if (has(/(^|\/)hooks?\//) || /^use[A-Z0-9]/.test(originalBase)) return 'hook';
  if (has(/(^|\/)(components?|ui|views?|widgets|pages|screens)\//) || /\.(tsx|jsx|vue|svelte)$/.test(base)) {
    return 'ui';
  }
  if (has(/(^|\/)(utils?|lib|helpers?|shared|common|core)\//)) return 'util';
  return 'other';
}

/**
 * Pick up to `n` extra files so the sample covers layers the top-ranked set
 * missed — tests first, because testing conventions are invisible in a
 * rank-only sample. Round-robin over UNCOVERED buckets (rank order inside a
 * bucket), then fill any remaining slots in plain rank order. Deterministic.
 */
export function pickDiversityExtras(
  ranked: ReadonlyArray<{ path: string }>,
  alreadyChosen: readonly string[],
  n: number,
): string[] {
  if (n <= 0) return [];
  const chosen = new Set(alreadyChosen.map(toPosix));
  const covered = new Set(alreadyChosen.map(classifyPath));

  const eligible = ranked
    .map((r) => toPosix(r.path))
    .filter((p) => !chosen.has(p) && isCodeFile(p) && !isExcluded(p) && isSafeRelativePath(p));

  const queues = new Map<PathBucket, string[]>(PATH_BUCKETS.map((b) => [b, []]));
  for (const p of eligible) queues.get(classifyPath(p))!.push(p);

  const out: string[] = [];
  const uncovered = PATH_BUCKETS.filter((b) => !covered.has(b));
  let progressed = true;
  while (out.length < n && progressed) {
    progressed = false;
    for (const b of uncovered) {
      const next = queues.get(b)!.shift();
      if (!next) continue;
      out.push(next);
      progressed = true;
      if (out.length >= n) break;
    }
  }
  for (const p of eligible) {
    if (out.length >= n) break;
    if (!out.includes(p)) out.push(p);
  }
  return out;
}

/** Cut a file to a line and character budget; `truncated` says whether anything was dropped. */
export function truncateForSample(
  content: string,
  limits: { maxLines?: number; maxChars: number },
): { content: string; truncated: boolean } {
  let out = content;
  let truncated = false;
  if (limits.maxLines !== undefined) {
    const lines = out.split(/\r?\n/);
    if (lines.length > limits.maxLines) {
      out = lines.slice(0, limits.maxLines).join('\n');
      truncated = true;
    }
  }
  if (out.length > limits.maxChars) {
    const cut = out.lastIndexOf('\n', limits.maxChars);
    out = out.slice(0, cut > 0 ? cut : limits.maxChars);
    truncated = true;
  }
  return { content: out, truncated };
}

/** Heuristic binary check — a NUL byte never appears in source text. */
export function looksBinary(content: string): boolean {
  return content.includes('\0');
}
