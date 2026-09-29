/**
 * repo-intel constants. Phase-tagged: [T1] used now; [T2]/[T3]
 * exported early so the pipeline lands against a single source of truth.
 */

// --- Job kinds (registered on JobRunner; enqueued from repos/service.ts) ----
export const INDEX_JOB_KIND = 'repo-intel-index';
export const REFRESH_JOB_KIND = 'repo-intel-refresh';
/** Manual "re-analyze": fetch latest from origin + incremental reindex. */
export const RESYNC_JOB_KIND = 'repo-intel-resync';

// --- Walk / parse scope -----------------------------------------------------
/** [T1] JS/TS files parsed by ast-grep and dependency-cruiser (not the walk scope, see INDEXED_EXT). */
export const SUPPORTED_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'] as const;

/** Python source extensions (indexed by the in-process Python scanner). */
export const PYTHON_EXT = ['.py'] as const;

/** Every extension the walk returns: JS/TS plus Python. */
export const INDEXED_EXT = [...SUPPORTED_EXT, ...PYTHON_EXT] as const;

/** Directory names whose .py files are skipped (Django migrations are generated noise). */
export const PYTHON_EXCLUDED_DIR_SEGMENTS = ['migrations'] as const;

/** A directory containing this file is a virtualenv and is not walked. */
export const VENV_MARKER_FILE = 'pyvenv.cfg';

/** [T1] Directories never walked. `.gitignore` is layered on top in T2 walk. */
export const EXCLUDED_DIRS = [
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  'out',
  'vendor',
  '.git',
  '__pycache__',
  '.venv',
  'venv',
  '.tox',
  '.nox',
  'site-packages',
  '.mypy_cache',
  '.pytest_cache',
  '.ruff_cache',
  '.eggs',
] as const;

// --- Read-time limits -------------------------------------------------------
/** [T1] Caller fan-out cap per changed symbol (ORDER BY rank DESC LIMIT N). */
export const MAX_CALLERS_PER_SYMBOL = 20;

/**
 * [T1] Bumped whenever the AST extractor or symbol schema changes. A mismatch
 * with `repo_index_state.indexer_version` forces a full reindex.
 *
 * v2 (T3): graph + decl_file resolution + file_rank + repo-map landed, so every
 * T2 `partial` index must be rebuilt to gain the rank-driven data.
 * v3: depgraph edges are POSIX on Windows too — indexes built there before had
 * no file_edges, so no decl_file, so no blast-radius callers; rebuild them.
 * v4: Python (.py) indexing — symbols/refs, import edges, Django/Flask/FastAPI/Celery facts;
 * bump forces a full reindex on the next refresh/resync.
 * v5: per-handler endpoint/cron attribution (file_facts.endpoint_handlers/cron_handlers); bump forces a full reindex.
 */
export const INDEXER_VERSION = 5;

// --- [T2] Full-index limits (documented now, enforced in the pipeline) ------
export const MAX_INDEXED_FILES = 5000;
export const MAX_FILE_SIZE = 400 * 1024; // 400 KB
export const MAX_PARSE_MS_PER_FILE = 2000;
/** Soft self-watch budget (< JobRunner hard 120s) → finish as `partial`. */
export const INDEX_SOFT_BUDGET_MS = 110_000;

// --- [T3] Graph / hotness / repo-map ---------------------------------------
export const BFS_DEPTH = 2;
export const HOTNESS_WINDOW_DAYS = 180;
export const DEFAULT_REPO_MAP_TOKEN_BUDGET = 1500;
/** Signatures are trimmed to this many chars in the parse phase (cache stability). */
export const MAX_SIGNATURE_CHARS = 120;
