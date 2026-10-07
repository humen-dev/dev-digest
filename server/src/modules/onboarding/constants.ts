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
 * AC-40: at most 20 candidate files are excerpted (first 120 lines each, in
 * rank order) — command source files (full text) are never subject to this
 * cap. Enforced before `fitToBudget`, which may still drop further down from
 * the tail to fit NFR-1.
 */
export const MAX_EXCERPT_FILES = 20;

/**
 * AC-37, NFR-2: the one `completeStructured` call per accepted generation.
 * The schema name itself is `TOUR_DRAFT_SCHEMA_NAME` (types.ts, Wave 0).
 */
export const DRAFT_MAX_TOKENS = 4_000;
export const DRAFT_TEMPERATURE = 0.3;

/** EC-12, NFR-3: generation wall-clock budget before a 504. */
export const GENERATION_TIMEOUT_MS = 120_000;

/**
 * M-1 (revised): the `maxRetries` the service passes to the single
 * `completeStructured` call. The adapter (src/adapters/llm/**, not owned
 * here) would otherwise retry this many times on a schema-repair reprompt,
 * each attempt wrapped in its own `timeoutMs` — so giving each attempt the
 * full generation budget let the loop as a whole run up to
 * `(maxRetries + 1) * timeoutMs`, several minutes for a hung/slow model,
 * holding the `inFlight` lock the whole time (EC-12, NFR-3).
 *
 * Splitting the remaining budget across attempts was tried first and proved
 * a worse regression: a real successful generation (single attempt) can
 * take up to ~45s, well over a third of the 120s budget, so a 3-way split
 * would time out *correct* single-attempt generations. Instead `maxRetries`
 * is 0 — a single attempt gets the *whole* remaining budget as its
 * `timeoutMs` (see `runGeneration`) — and adapter repair is simply not used;
 * an invalid response fails normally (EC-10: error + Retry) rather than
 * silently stacking attempts past the deadline.
 */
export const STRUCTURED_MAX_RETRIES = 0;

/** A floor so a near-exhausted remaining budget still fails fast rather than with a ~0ms timeout. */
export const MIN_STRUCTURED_TIMEOUT_MS = 1_000;

const COMMAND_SOURCE_BASENAMES: ReadonlySet<string> = new Set([
  'package.json',
  'Makefile',
  'manage.py',
  'pyproject.toml',
  'setup.cfg',
  'CONTRIBUTING.md',
]);
const COMPOSE_FILE_RE = /^(docker-compose.*\.ya?ml|compose\.ya?ml)$/;
const README_FILE_RE = /^README/;
const REQUIREMENTS_FILE_RE = /^requirements[^/]*\.txt$/;
const ENV_EXAMPLE_FILE_RE = /^\.env\.(example|sample|template)$/;

/**
 * True when `path` is a recognized "command source" file — the file kinds
 * `domain/commands.ts`'s grounding rules 2-8 read scripts/targets/services
 * from (`package.json`, `Makefile`, a compose file, a requirements file, an
 * `.env.example` variant, `manage.py`, `pyproject.toml`, `setup.cfg`, a
 * `README*`, `CONTRIBUTING.md`). Used to split the AC-44 candidate set into
 * excerpt files vs. command-source files.
 *
 * SPEC-03 Definitions ("Command source files"): only files at the repository
 * root or exactly one directory level below it qualify — `path` has at most
 * one `/`.
 */
export function isCommandSourcePath(path: string): boolean {
  const segments = path.split('/');
  if (segments.length > 2) return false;
  const base = segments[segments.length - 1]!;
  return (
    COMMAND_SOURCE_BASENAMES.has(base) ||
    COMPOSE_FILE_RE.test(base) ||
    README_FILE_RE.test(base) ||
    REQUIREMENTS_FILE_RE.test(base) ||
    ENV_EXAMPLE_FILE_RE.test(base)
  );
}
