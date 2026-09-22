/**
 * Constants for the skills module (import limits, archive selection rules).
 *
 * Sizes are deliberately conservative: skills are short markdown documents
 * (rules/rubrics), not general file storage.
 */

/**
 * Max size (bytes) of the raw uploaded buffer — applies to BOTH a standalone
 * `.md` file and a `.zip` archive, checked immediately after base64-decoding
 * and BEFORE any unzip work starts. Well under the route's `bodyLimit: 4MB`
 * (base64 encoding adds ~33% overhead on top of this).
 */
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024; // 2 MB

/** Max number of entries an archive may contain (zip-bomb entry-count guard). */
export const MAX_ARCHIVE_ENTRIES = 200;

/**
 * Max total UNCOMPRESSED size across all archive entries (zip-bomb guard).
 * Enforced using each entry's `originalSize` from the zip's own metadata
 * BEFORE that entry is inflated (see `domain/parse-archive.ts`).
 */
export const MAX_UNCOMPRESSED_BYTES = 5 * 1024 * 1024; // 5 MB

/** Filenames (basename match) considered "the" skill file inside an archive. */
export const SKILL_FILE_CANDIDATES = ['SKILL.md'] as const;

/**
 * Extensions (or the `scripts/` directory) that mark an archive entry as
 * "executable" — never processed, but called out in `warnings` so the
 * import preview is honest about what it silently dropped.
 */
export const EXECUTABLE_EXT = ['.sh', '.py', '.js', '.mjs', '.cjs', '.ps1', '.bat', '.exe'] as const;

/** Skill type assigned when frontmatter is absent or its `type` is unrecognized. */
export const DEFAULT_SKILL_TYPE = 'custom' as const;

/** Initial version recorded for a newly-created skill. */
export const INITIAL_SKILL_VERSION = 1;

/** Context lines around each change in a rendered unified diff. */
export const DIFF_CONTEXT_LINES = 3;
