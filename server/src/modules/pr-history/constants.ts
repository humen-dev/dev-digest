/** Caps for the "Prior PRs touching these files" lookup (docs/plans/blast-radius-p3.md §3.4). */
export const MAX_HISTORY_FILES = 10;
export const COMMITS_PER_PATH = 10;
export const PRS_PER_COMMIT = 3;
export const MAX_HISTORY_ITEMS = 10;
export const PR_HISTORY_CACHE_TTL_MS = 10 * 60_000;
export const PR_HISTORY_CACHE_MAX = 200;
