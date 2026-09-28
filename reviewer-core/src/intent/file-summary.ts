import type { UnifiedDiff } from '@devdigest/shared';
import type { IntentChangedFile } from './schema.js';
import { MAX_FILES, MAX_HUNK_HEADERS_PER_FILE, MAX_HUNK_HEADER_CHARS } from './constants.js';

/**
 * File-list summary for the intent classifier — deliberately the CHEAPEST diff
 * signal: paths, +/- counts, and hunk HEADER lines (`@@ -a,b +c,d @@ …`) only.
 * Hunk body lines (the actual added/removed code) are never included; the
 * classifier decides scope from headers and context, not from reading the diff.
 */

const FILE_HEADER_RE = /^diff --git a\/(.+) b\/(.+)$/;
const NEW_FILE_HEADER_RE = /^\+\+\+ b\/(.+)$/;

/** Extract per-file hunk headers from a raw unified diff. Never returns +/- or context lines. */
function hunkHeadersByPath(raw: string): Map<string, string[]> {
  const headers = new Map<string, string[]>();
  let currentPath: string | null = null;
  for (const line of raw.split('\n')) {
    const gitHeader = FILE_HEADER_RE.exec(line);
    if (gitHeader) {
      currentPath = gitHeader[2] ?? gitHeader[1] ?? null;
      continue;
    }
    const newHeader = NEW_FILE_HEADER_RE.exec(line);
    if (newHeader) {
      currentPath = newHeader[1] ?? currentPath;
      continue;
    }
    if (line.startsWith('@@') && currentPath) {
      const list = headers.get(currentPath) ?? [];
      if (list.length < MAX_HUNK_HEADERS_PER_FILE) {
        list.push(line.length > MAX_HUNK_HEADER_CHARS ? line.slice(0, MAX_HUNK_HEADER_CHARS) : line);
      }
      headers.set(currentPath, list);
    }
  }
  return headers;
}

/** Changed files + hunk headers, from `diff.raw` (headers) and `diff.files` (counts). */
export function changedFilesFromDiff(diff: UnifiedDiff): IntentChangedFile[] {
  const headers = hunkHeadersByPath(diff.raw);
  return diff.files.slice(0, MAX_FILES).map((f) => ({
    path: f.path,
    additions: f.additions,
    deletions: f.deletions,
    hunk_headers: headers.get(f.path) ?? [],
  }));
}

/** Render the file list for the prompt: one line per file + indented headers. */
export function renderFileList(files: IntentChangedFile[]): { text: string; truncated: boolean } {
  const truncated = files.length > MAX_FILES;
  const capped = files.slice(0, MAX_FILES);
  const text = capped
    .map((f) => {
      const headerLines = f.hunk_headers.map((h) => `  ${h}`).join('\n');
      return headerLines.length > 0
        ? `${f.path} (+${f.additions}/-${f.deletions})\n${headerLines}`
        : `${f.path} (+${f.additions}/-${f.deletions})`;
    })
    .join('\n');
  return { text, truncated };
}
