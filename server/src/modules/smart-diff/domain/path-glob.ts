/**
 * Hand-written glob -> RegExp compiler for the Smart Diff classifier
 * (docs/plans/smart-diff.md §3.3). No dependency, compiled once at module load.
 */

/** `\` -> `/`; strip a leading `./` or `/`. */
export function normalizePath(path: string): string {
  let p = path.replace(/\\/g, '/');
  while (p.startsWith('./')) p = p.slice(2);
  while (p.startsWith('/')) p = p.slice(1);
  return p;
}

/** Escape regex metacharacters other than `*`, then turn `*` into `[^/]*`. */
function translateSegment(segment: string): string {
  const escaped = segment.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  return escaped.replace(/\*/g, '[^/]*');
}

/**
 * Compile one glob to a case-insensitive RegExp (semantics: docs/plans/smart-diff.md §3.3).
 * Do not spell a double-star glob literally inside a block comment (server INSIGHTS 2026-09-27) —
 * it closes the comment early and produces a baffling TS2304/parse error far from the cause.
 *
 * - A glob without `/` matches the basename at any depth.
 * - A glob with `/` is anchored at the repo root; a leading `**` + slash means
 *   zero or more leading directories, a trailing slash + `**` means anything
 *   below that directory, `*` matches a run of non-`/` characters.
 */
export function globToRegExp(glob: string): RegExp {
  if (!glob.includes('/')) {
    return new RegExp(`^(?:.*/)?${translateSegment(glob)}$`, 'i');
  }

  let g = glob;
  let leading = false;
  let trailing = false;
  if (g.startsWith('**/')) {
    leading = true;
    g = g.slice(3);
  }
  if (g.endsWith('/**')) {
    trailing = true;
    g = g.slice(0, -3);
  }

  const body = g
    .split('/')
    .map(translateSegment)
    .join('/');
  const prefix = leading ? '(?:.*/)?' : '';
  const suffix = trailing ? '/.*' : '';
  return new RegExp(`^${prefix}${body}${suffix}$`, 'i');
}
