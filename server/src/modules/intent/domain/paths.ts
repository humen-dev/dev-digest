/**
 * Repo-relative path safety for intent's file reads (`readFileAt`). Re-implemented
 * here rather than imported from `conventions/domain/sampling.ts`: cross-module
 * sharing only happens through `index.ts` / `ports.ts` / `types.ts`
 * (`no-cross-module-internals`, `.dependency-cruiser.cjs`).
 */

export function toPosix(path: string): string {
  return path.replaceAll('\\', '/');
}

/**
 * True when `path` is a plain repo-relative path: no absolute root, no drive
 * letter, no `..` segment, no NUL byte.
 */
export function isSafeRepoPath(path: string): boolean {
  if (!path || path.includes('\0')) return false;
  const p = toPosix(path);
  if (p.startsWith('/') || /^[a-zA-Z]:/.test(p)) return false;
  return !p.split('/').some((seg) => seg === '..');
}
