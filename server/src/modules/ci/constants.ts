/**
 * SPEC-07 (export to CI) — fixed names, paths and limits shared by the CI
 * generation domain, the ingest domain and the service. Plain values only.
 */

export const WORKFLOW_PATH = '.github/workflows/devdigest-review.yml';
export const WORKFLOW_NAME = 'DevDigest Review';
export const JOB_ID = 'review';
/** Assumption (manual check on a demo repo): GitHub lists the job as "<workflow> / <job>". */
export const REQUIRED_CHECK_NAME = 'DevDigest Review / review';

export const CI_BRANCH = 'devdigest/ci';
export const EXPORT_PR_TITLE = 'Add DevDigest CI review';

/** Path the base-commit checkout lands in (AC-22, AC-84). */
export const BASE_DIR = '.devdigest-base';
export const RUNNER_DIR = '.devdigest/runner';
export const RUNNER_ENTRY = `${RUNNER_DIR}/index.js`;
export const MEMORY_PATH = '.devdigest/memory.jsonl';
export const agentManifestPath = (slug: string): string => `.devdigest/agents/${slug}.yaml`;
export const skillFilePath = (slug: string): string => `.devdigest/skills/${slug}.md`;

export const ARTIFACT_NAME = 'devdigest-result';
export const RESULT_FILENAME = 'devdigest-result.json';
export const RUN_META_FILENAME = 'devdigest-run.json';

export const OPENROUTER_SECRET_NAME = 'OPENROUTER_API_KEY';

/** Bumped whenever the generated workflow's shape changes (AC-60 "outdated"). */
export const GENERATOR_VERSION = 1;

/**
 * Every action pinned to a full commit SHA (AC-21). Verified with
 * `gh api repos/<owner>/<repo>/git/ref/tags/<tag>` on 2026-10-12.
 */
export const PINNED_ACTIONS = {
  checkout: { repo: 'actions/checkout', sha: '11d5960a326750d5838078e36cf38b85af677262', version: 'v4.4.0' },
  setupNode: { repo: 'actions/setup-node', sha: '49933ea5288caeca8642d1e84afbd3f7d6820020', version: 'v4.4.0' },
  uploadArtifact: {
    repo: 'actions/upload-artifact',
    sha: 'ea165f8d65b6e75b540449e92b4886f43607fa02',
    version: 'v4.6.2',
  },
} as const;

export const MAX_ARTIFACT_ZIP_BYTES = 1_048_576;
export const MAX_ARTIFACT_ENTRIES = 64;
export const MAX_ARTIFACT_ENTRY_BYTES = 262_144;
export const REFRESH_DEBOUNCE_MS = 30_000;

export const BOOTSTRAP_NOTICE = 'DevDigest is not installed on the base branch yet — review skipped';

/** AC-85 / EC-25 — completed runs without an artifact that are ignored (nothing stored). */
export const IGNORED_NO_ARTIFACT_CONCLUSIONS = ['success', 'skipped', 'cancelled'] as const;

export const CI_FAILURE_REASONS = {
  repoMismatch: 'repository mismatch',
  metadataMismatch: 'metadata mismatch',
  workflowPath: 'workflow path mismatch',
  resultSchema: 'schema invalid: devdigest-result.json',
  metaSchema: 'schema invalid: devdigest-run.json',
  secret: 'secret-shaped content',
  noResult: 'no result artifact',
  expired: 'artifact expired',
  tooLarge: 'artifact too large',
  badEntry: 'artifact entry name invalid',
  postFailed: 'posting to GitHub failed',
} as const;
