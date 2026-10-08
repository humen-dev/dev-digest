/**
 * Pure grounding rules for a model-cited path against the tracked tree at
 * the tour commit (SPEC-03 Definitions "Grounded path", UT-4). No I/O:
 * `tracked` is the caller's materialized set of POSIX, repo-relative
 * tracked file paths.
 */

/**
 * UT-4: an absolute path, a drive letter, a `..` segment, a backslash or a
 * NUL byte are never grounded, whatever the kind.
 */
export function isSafeCitedPath(path: string): boolean {
  if (!path || path.includes('\0') || path.includes('\\')) return false;
  if (path.startsWith('/')) return false;
  if (/^[a-zA-Z]:/.test(path)) return false;
  return !path.split('/').some((seg) => seg === '..');
}

export interface GroundPathResult {
  grounded: boolean;
  /** Only meaningful when `grounded` — a new-file target not itself tracked (AC-46). */
  newFile: boolean;
}

/**
 * Grounds a cited path against `tracked` per the "Grounded path" definition:
 * - a file path: `tracked` has it verbatim;
 * - a glob (contains `*`): it matches at least 1 tracked file;
 * - a directory path (ends in `/`): it contains at least 1 tracked file;
 * - when `allowNewFile` (first-task targets only): a new-file target whose
 *   parent directory holds at least 1 tracked file.
 */
export function groundPath(path: string, tracked: ReadonlySet<string>, allowNewFile = false): GroundPathResult {
  if (!isSafeCitedPath(path)) return { grounded: false, newFile: false };

  if (path.endsWith('/')) {
    return { grounded: hasTrackedWithPrefix(path, tracked), newFile: false };
  }
  if (path.includes('*')) {
    const re = globToRegExp(path);
    for (const t of tracked) if (re.test(t)) return { grounded: true, newFile: false };
    return { grounded: false, newFile: false };
  }
  if (tracked.has(path)) return { grounded: true, newFile: false };
  if (allowNewFile && hasTrackedInDir(dirOf(path), tracked)) {
    return { grounded: true, newFile: true };
  }
  return { grounded: false, newFile: false };
}

function hasTrackedWithPrefix(prefix: string, tracked: ReadonlySet<string>): boolean {
  for (const t of tracked) if (t.startsWith(prefix)) return true;
  return false;
}

/** The directory part of `path` ('' for a root-level file). */
function dirOf(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx < 0 ? '' : path.slice(0, idx);
}

function hasTrackedInDir(dir: string, tracked: ReadonlySet<string>): boolean {
  for (const t of tracked) if (dirOf(t) === dir) return true;
  return false;
}

/**
 * Translates a grounding glob to a RegExp: `*` matches within one path
 * segment, `**` matches across segments. No new dependency — this is the
 * entire matcher the feature needs.
 */
function globToRegExp(glob: string): RegExp {
  let out = '';
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i];
    if (ch === undefined) continue;
    if (ch === '*' && glob[i + 1] === '*') {
      out += '.*';
      i += 1;
      continue;
    }
    if (ch === '*') {
      out += '[^/]*';
      continue;
    }
    out += /[.+?^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
  }
  return new RegExp(`^${out}$`);
}
