import { unzipSync, type UnzipFileInfo } from 'fflate';
import { ValidationError } from '../../../platform/errors.js';
import {
  EXECUTABLE_EXT,
  MAX_ARCHIVE_ENTRIES,
  MAX_UNCOMPRESSED_BYTES,
  SKILL_FILE_CANDIDATES,
} from '../constants.js';
import { parseSkillMarkdown } from './parse-markdown.js';
import type { ExtractedSkillArchive } from '../types.js';

/**
 * Extract exactly one `SKILL.md` from a `.zip` archive buffer.
 *
 * A skill is text only — no executable parts, no filesystem writes, nothing
 * runs. Everything in the archive except the chosen markdown file is reported
 * in `ignored_entries`; executable-looking entries additionally produce a
 * warning so the import preview is honest about what it silently dropped.
 *
 * Zip-bomb / path-traversal guards, in order:
 *  1. `fflate`'s `filter` callback sees each entry's metadata — including
 *     `originalSize` from the zip's own local header — BEFORE that entry is
 *     inflated. We reject (skip decompressing) any entry once the running
 *     entry count exceeds `MAX_ARCHIVE_ENTRIES`, the running uncompressed
 *     total exceeds `MAX_UNCOMPRESSED_BYTES`, or the entry's path is unsafe
 *     (`..`, a leading slash, or a drive letter) — so a pathological archive
 *     never gets fully inflated into memory.
 *  2. The caller (service.ts) additionally caps the COMPRESSED buffer size
 *     (`MAX_IMPORT_BYTES`) before this function is ever called.
 */
export function extractSkillFromArchive(bytes: Uint8Array): ExtractedSkillArchive {
  let entryCount = 0;
  let totalUncompressed = 0;
  let rejectReason: string | null = null;

  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(bytes, {
      filter(file: UnzipFileInfo) {
        entryCount += 1;
        if (rejectReason) return false; // already failing — stop inflating anything else
        if (entryCount > MAX_ARCHIVE_ENTRIES) {
          rejectReason = `Archive has too many entries (> ${MAX_ARCHIVE_ENTRIES}).`;
          return false;
        }
        if (isUnsafePath(file.name)) {
          rejectReason = `Archive entry has an unsafe path: "${file.name}".`;
          return false;
        }
        totalUncompressed += file.originalSize;
        if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
          rejectReason = `Archive is too large when uncompressed (> ${MAX_UNCOMPRESSED_BYTES} bytes).`;
          return false;
        }
        return true;
      },
    });
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new ValidationError(`Could not read archive: ${(err as Error).message}`);
  }
  if (rejectReason) throw new ValidationError(rejectReason);

  // Directory entries appear as zero-length paths ending in '/' — not real files.
  const fileEntries = Object.keys(unzipped).filter((p) => !p.endsWith('/'));

  const skillCandidates = fileEntries.filter((p) => {
    const base = p.split('/').pop() ?? p;
    return (SKILL_FILE_CANDIDATES as readonly string[]).includes(base);
  });

  let chosen: string;
  if (skillCandidates.length > 0) {
    // Shallowest path wins; ties broken alphabetically for determinism.
    skillCandidates.sort((a, b) => depth(a) - depth(b) || a.localeCompare(b));
    chosen = skillCandidates[0]!;
  } else {
    const mdCandidates = fileEntries.filter((p) => p.toLowerCase().endsWith('.md'));
    if (mdCandidates.length !== 1) {
      throw new ValidationError(
        mdCandidates.length === 0
          ? 'Archive does not contain a SKILL.md or any .md file.'
          : `Archive contains ${mdCandidates.length} .md files and no SKILL.md — ambiguous, ` +
            'add a SKILL.md to disambiguate.',
      );
    }
    chosen = mdCandidates[0]!;
  }

  const warnings: string[] = [];
  const ignored_entries: string[] = [];
  for (const p of fileEntries) {
    if (p === chosen) continue;
    ignored_entries.push(p);
    if (isExecutablePath(p)) {
      warnings.push(`"${p}" looks executable and was not processed — skills are text-only.`);
    }
  }

  const text = Buffer.from(unzipped[chosen]!).toString('utf8');
  const { draft, warnings: mdWarnings } = parseSkillMarkdown(text, chosen);
  return { draft, ignored_entries, warnings: [...warnings, ...mdWarnings] };
}

function depth(path: string): number {
  return path.split('/').length;
}

/** Path traversal guard: reject `..` segments, absolute paths, and drive letters. */
function isUnsafePath(path: string): boolean {
  if (path.startsWith('/') || path.startsWith('\\')) return true;
  if (/^[A-Za-z]:/.test(path)) return true; // Windows drive-letter absolute path
  return path.split(/[/\\]/).some((part) => part === '..');
}

function isExecutablePath(path: string): boolean {
  const lower = path.toLowerCase();
  if (lower === 'scripts' || lower.startsWith('scripts/') || lower.includes('/scripts/')) {
    return true;
  }
  return (EXECUTABLE_EXT as readonly string[]).some((ext) => lower.endsWith(ext));
}
