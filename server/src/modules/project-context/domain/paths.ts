/**
 * Pure, server-only rules for repo-relative project document paths
 * (SPEC-01 UT-6, AC-3..AC-5). `isValidDocPathSyntax` backs the `DocPath` zod
 * refinement used by the HTTP layer; `isExcludedPath` / `isProjectDocPath`
 * decide whether a walked path counts as a project document.
 *
 * `isExcludedPath` is duplicated (not shared) in
 * `adapters/project-docs/index.ts`'s `isExcludedDirName` — adapters may not
 * import a module's domain (`adapters-not-into-modules`,
 * `.dependency-cruiser.cjs`). Keep both in sync if the rule ever changes.
 */

const DEFAULT_EXCLUDED_DIR_NAMES: ReadonlySet<string> = new Set(['node_modules']);

/**
 * True when `path` is a plain, repo-relative Markdown path: no absolute
 * root, no drive letter, no backslash, no `..` segment, no NUL byte, and it
 * ends in `.md`.
 */
export function isValidDocPathSyntax(path: string): boolean {
  if (!path || path.includes('\0')) return false;
  if (!path.endsWith('.md')) return false;
  if (path.includes('\\')) return false;
  if (path.startsWith('/')) return false;
  if (/^[a-zA-Z]:/.test(path)) return false;
  return !path.split('/').some((seg) => seg === '..');
}

/**
 * True when any DIRECTORY segment of `path` (every segment but the
 * filename) starts with `.`, is `node_modules`, or is named in
 * `extraExcludedDirNames`. The filename itself is never checked here.
 */
export function isExcludedPath(path: string, extraExcludedDirNames: readonly string[] = []): boolean {
  const segments = path.split('/');
  const dirSegments = segments.slice(0, -1);
  return dirSegments.some(
    (seg) => seg.startsWith('.') || DEFAULT_EXCLUDED_DIR_NAMES.has(seg) || extraExcludedDirNames.includes(seg),
  );
}

/** A walked path counts as a project document: ends in `.md` and is not excluded. */
export function isProjectDocPath(path: string, extraExcludedDirNames: readonly string[] = []): boolean {
  return path.endsWith('.md') && !isExcludedPath(path, extraExcludedDirNames);
}
