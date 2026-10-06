/**
 * Constants for the onboarding-tour module (SPEC-03).
 */

/** AC-44: top-N ranked files feed the candidate set (with critical-path chain files and command sources). */
export const CANDIDATE_TOP_N = 40;

/**
 * How many ranked paths `getRankedPaths` contributes to `domain/input.ts`'s
 * `buildFileTree` priority ordering. `buildFileTree` itself caps the tree at
 * 300 entries (AC-39) — this is just the pool it picks from.
 */
export const TREE_RANK_POOL = 1000;

/** NFR-1: the whole prompt (system + user) must count under this many tokens. */
export const PROMPT_TOKEN_BUDGET = 20_000;

/**
 * AC-37, NFR-2: the one `completeStructured` call per accepted generation.
 * The schema name itself is `TOUR_DRAFT_SCHEMA_NAME` (types.ts, Wave 0).
 */
export const DRAFT_MAX_TOKENS = 4_000;
export const DRAFT_TEMPERATURE = 0.3;

/** EC-12, NFR-3: generation wall-clock budget before a 504. */
export const GENERATION_TIMEOUT_MS = 120_000;

const COMMAND_SOURCE_BASENAMES: ReadonlySet<string> = new Set(['package.json', 'manage.py', 'pyproject.toml']);
const MAKEFILE_RE = /^Makefile$/;
const COMPOSE_FILE_RE = /^(docker-compose.*\.ya?ml|compose\.ya?ml)$/;
const REQUIREMENTS_FILE_RE = /(^|\/)requirements[^/]*\.txt$/;
const ENV_EXAMPLE_FILE_RE = /(^|\/)\.env\.(example|sample|template)$/;

/**
 * True when `path` is a recognized "command source" file — the file kinds
 * `domain/commands.ts`'s grounding rules 2-8 read scripts/targets/services
 * from (`package.json`, `Makefile`, a compose file, a requirements file, an
 * `.env.example` variant, `manage.py`, `pyproject.toml`). Used to split the
 * AC-44 candidate set into excerpt files vs. command-source files.
 */
export function isCommandSourcePath(path: string): boolean {
  const base = path.slice(path.lastIndexOf('/') + 1);
  return (
    COMMAND_SOURCE_BASENAMES.has(base) ||
    MAKEFILE_RE.test(base) ||
    COMPOSE_FILE_RE.test(base) ||
    REQUIREMENTS_FILE_RE.test(path) ||
    ENV_EXAMPLE_FILE_RE.test(path)
  );
}
