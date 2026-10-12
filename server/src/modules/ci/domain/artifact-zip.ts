import { unzipSync, strFromU8 } from 'fflate';
import {
  MAX_ARTIFACT_ENTRIES,
  MAX_ARTIFACT_ENTRY_BYTES,
  RESULT_FILENAME,
  RUN_META_FILENAME,
  type CI_FAILURE_REASONS,
} from '../constants.js';

/** Key into `CI_FAILURE_REASONS`; the service stores `CI_FAILURE_REASONS[key]`. */
export type CiFailureKey = keyof typeof CI_FAILURE_REASONS;

/**
 * Untrusted-input boundary for the CI artifact zip (NFR-6, UT-4/5). Pure: the
 * caller already fetched the bytes. Every limit is decided from the central
 * directory (names, declared sizes) inside fflate's `filter`, which runs before
 * any entry is inflated, so a rejected entry is never decompressed.
 */

export type ArtifactZipResult = { result?: string; meta?: string } | { failure: CiFailureKey };

const EXPECTED_NAMES: ReadonlySet<string> = new Set([RESULT_FILENAME, RUN_META_FILENAME]);

/** Absolute path, drive letter, or any `..` segment. */
function isUnsafeEntryPath(name: string): boolean {
  const normalized = name.replace(/\\/g, '/');
  if (normalized.startsWith('/')) return true;
  if (/^[A-Za-z]:\//.test(normalized)) return true;
  return normalized.split('/').includes('..');
}

export function readArtifactZip(bytes: Uint8Array): ArtifactZipResult {
  let entries = 0;
  let badEntry = false;
  let tooLarge = false;

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (file) => {
        entries += 1;
        if (entries > MAX_ARTIFACT_ENTRIES) {
          badEntry = true;
          return false;
        }
        if (isUnsafeEntryPath(file.name) || !EXPECTED_NAMES.has(file.name)) {
          badEntry = true;
          return false;
        }
        if (file.originalSize > MAX_ARTIFACT_ENTRY_BYTES) {
          tooLarge = true;
          return false;
        }
        return true;
      },
    });
  } catch {
    return { failure: 'badEntry' };
  }

  if (badEntry) return { failure: 'badEntry' };
  if (tooLarge) return { failure: 'tooLarge' };

  const out: { result?: string; meta?: string } = {};
  const result = files[RESULT_FILENAME];
  const meta = files[RUN_META_FILENAME];
  if (result) out.result = strFromU8(result);
  if (meta) out.meta = strFromU8(meta);
  return out;
}
