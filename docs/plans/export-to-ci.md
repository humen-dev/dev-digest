# Export to CI — development plan

| Field | Value |
|---|---|
| Status | approved (2026-10-12) |
| Goal | A user exports a tuned review agent to a GitHub repository (PR or zip). The agent then reviews every PR inside GitHub Actions with the studio engine and can block merges. Verified CI results appear in the CI tab and on the CI Runs page (SPEC-07 G-1…G-5). |
| Requirements source | [`specs/2026-10-12-export-to-ci.md`](../../specs/2026-10-12-export-to-ci.md) (SPEC-07, approved, amended in place 2026-10-12). Reference implementation `upstream/full-functionality` (FF), read-only copies in the session scratchpad `ff-ref/`. |
| Execution mode | multi-agent (parallel waves) — chosen by the user |
| Packages touched | server · client · agent-runner · e2e · shared (vendored, server + client copies) · `scripts/agent-check.mjs` |

## 1. Context

**What exists today**
- `agent-runner/` already runs `reviewPullRequest` with the grounding gate and the deterministic gate. Three gaps:
  - it writes the artifact **before** posting (`agent-runner/src/run.ts:140-156`);
  - a post failure falls into the hard-fail catch (`run.ts:167-171`);
  - an empty key still builds the provider (`agent-runner/src/index.ts:39`).
- Contracts live in `server/src/vendor/shared/contracts/eval-ci.ts:294-400`. The client copy lacks `AgentManifest` (`client/src/vendor/shared/contracts/eval-ci.ts:305`). Nothing outside the vendored files and the runner uses the CI contracts.
- Tables `ci_installations` / `ci_runs` have the old shape (`server/src/db/schema/ci.ts:4-26`). Nothing reads or writes them, the seed included. `agent_runs.pr_id` is nullable and `source` accepts `ci` (`server/src/db/schema/runs.ts:14`, `:26`).
- GitHub has `commitFiles` / `findOpenPr` / `openPullRequest` (`server/src/vendor/shared/adapters.ts:162-170`, `server/src/adapters/github/octokit.ts:245-349`). `getPullRequest` maps PR status (`octokit.ts:19-22`).
- Missing pieces:
  - no `server/src/modules/ci`;
  - no CI tab (`client/src/app/agents/[id]/_components/AgentEditor/constants.ts:13-18`);
  - no `/ci-runs` route;
  - no nav item (`client/src/vendor/ui/nav.ts:25-42`); only `activeKeyFor` knows the route (`client/src/components/app-shell/helpers.ts:38`).

**Why it is not enough.** See SPEC-07 *Problem and user*. This plan ports FF where SPEC-07 agrees and builds SPEC-07's deltas:
- base-commit runner, bootstrap guard (AC-84/85);
- numeric repo id check;
- extended artifact plus sidecar;
- concurrency;
- workflow and generator version;
- YAML validation and an editable workflow;
- provider gate;
- state chips and the required check name;
- a 3-option Fail CI on;
- `devdigest-review.yml`;
- a stable `.devdigest/agents/<slug>.yaml` (AC-86).

**Constraints relied on**
- `server/INSIGHTS.md`:
  - `:25` route tests use MockAuthProvider;
  - `:36-37`, `:40`, `:42-43` ports, container-inline adapters, no cross-module internals;
  - `:58` nullish body;
  - `:59` check the IT skip count;
  - `:70` secret-shaped fixtures are built at runtime.
- `client/INSIGHTS.md`:
  - `:17` the page tab whitelist derives from `TABS`;
  - `:18` `!data` guard;
  - `:27` vendored drift;
  - `:44` no user-event, so tests use `fireEvent`;
  - `:59` type-only shared imports.
- `agent-runner/insights/INSIGHTS.md`: ncc bundle; narrow on `artifact === null`.

**Scope guard.** The multi-agent run service, PR list, PR run history, the Config tab "CI gate" field, reviewer-core and MCP stay untouched.

### Requirements review
| # | Finding | Resolution |
|---|---|---|
| 1 | Bootstrap: on the export PR the base branch has no runner, so the first run fails | **Accepted rec. 2.** Spec amended: AC-84 (guard), AC-25 (metadata/upload only when the guard passed), AC-85 + EC-25 (store nothing), AC-77/EC-16 (failed only for other conclusions) |
| 2 | Secret scan vs runner bundle | Spec Term "Credential-shaped string" now means the FF `redact.ts` patterns plus workspace secret values, over every generated file including the bundle. NFR-15 adds a bundle scan. Empirically 0 matches on the built bundle |
| 3 | Where YAML validation runs | **Accepted rec. 3 (b).** One server validator. Preview returns violations and warnings; the client calls it with a ~500 ms debounce. No new client dependency |
| 4 | Agent update verb | Spec AC-53 now says `PUT /agents/:id`. The client uses the existing `useUpdateAgent` (`client/src/lib/hooks/agents.ts:61`) |
| 5 | FF writes `agent_runs` from `ci/repository.ts`, which breaks onion rule 8 | Add port `CiAgentRunWriter`, implemented in `container.ts` over a new function in `reviews/repository/run.repo.ts` (the table owner, `:117-185`) |
| 6 | FF migration adds NOT NULL columns without defaults | New `0020_ci_export.sql`. Columns are nullable or defaulted. `ci_installations.workspace_id` is backfilled from `agents`, then set NOT NULL |
| 7 | `WorkflowRun` lacks repo id, path, event and attempt; there is no repo / default-branch lookup | Extend `GitHubClient` in Wave 0 (§3.2) |
| 8 | Runner order must become post → artifact; key check must be explicit | U3 |
| 9 | `agent-check.mjs` does not know `agent-runner` (`scripts/agent-check.mjs:28`) | **Accepted rec. 1:** Wave 0 adds it |
| 10 | Nav item, `api.ts` blob download, i18n keys | Wave 0 |
| 11 | No user-event in the client | Tests use `fireEvent`. NFR-9 focus trap is asserted with keyDown + `document.activeElement` |
| 12 | AC-60: skill edits do not bump `agents.version` (`server/src/modules/agents/repository.ts:120-122`) | Known consequence, no change |
| 13 | AC-84 says the guard is "the first step", but checking the base commit needs the base checkout step to run before it | The plan puts the base checkout as step 1 and the guard as step 2. The AC-84 test asserts that no step other than the base checkout precedes the guard. Raised as the only remaining §9 follow-up |

### Decisions
1. **Stable manifest path (AC-86, EC-26).** At first export the API stores `manifest_slug = agentSlug(name)` on the installation. Every later preview, export or zip for that repo reuses it.
2. **The workflow writes the sidecar.** `devdigest-run.json` is written by a workflow step (as in FF), not by the runner, with values from step `env:` only. It must exist even when the runner fails (AC-50). *Rejected:* a runner-written sidecar.
3. **Ingest rule for runs without an artifact (AC-85, EC-25, AC-77, EC-16).** A completed run with no `devdigest-result` artifact:
   - conclusion `success`, `skipped` or `cancelled` → ignored;
   - any other conclusion → stored `failed` / "no result artifact".
4. **Cross-module write without a cross-module transaction.** Sequence:
   1. `ciRepo.claimRun` (insert … ON CONFLICT DO NOTHING);
   2. `agentRuns.insertCompletedCiRun` (owned by reviews; inserts agent_run + trace in its own transaction);
   3. `ciRepo.linkAgentRun`.

   AC-78 holds because the agent run is created only after a won claim. A crash between steps leaves an invisible orphan (§8). *Rejected:* a shared transaction across module repositories; there is no `Tx` seam today.
5. **Republish endpoint not built.** The spec removed it. AC-61 goes through `export-ci`.
6. **Archive also validates the workflow.** It answers 422 on any AC-14 violation, the same as export. This is defence in depth: the UI never gets there because Continue is disabled.
7. **CI Runs trace (AC-67).** A small `CiRunTraceDrawer` inside the CI Runs view, over `useRunTrace` (`client/src/lib/hooks/trace.ts:12`). *Rejected:* promoting `pulls/[number]/_components/RunTraceDrawer`. That is about 15 files in the PR detail route, outside the scope guard; the duplicate is tolerated per frontend rule 1.
8. **Runner bundle files.** The API reads the whole of `config.ciRunnerBundleDir` (`index.js`, chunk files, `package.json`) through an fs adapter behind a port.
9. **Pinned actions.** Reuse FF's `PINNED_ACTIONS` SHAs (FF `constants.ts:55-59`) and re-verify them before merge (§8).
10. **PR title and PR link** come from GitHub run metadata (`display_title`, repository `html_url` + `/pull/<n>`), never from the sidecar (AC-80).

### Open questions
none. The wording of the "first step" in AC-84 is a §9 follow-up; the plan already follows finding 13.

## 2. Affected modules
| Package | Touched? | Why / what changes | Architecture rule that applies |
|---|---|---|---|
| server | yes | new `modules/ci` (domain, ports, service, repository, routes); schema + migration; config; GitHub adapter; fs bundle adapter; a reviews run-writer function; container wiring | onion: domain pure (ring 1), services take ports (2), repository/adapters (3), routes/container (4); the depcruise baseline must not grow |
| client | yes | CI tab + ExportWizard in the agent editor, `/ci-runs` route, `lib/hooks/ci.ts`, `api.ts`, nav, i18n | frontend-ui-architecture: thin pages, `_components/<Pascal>/`, hooks over `api.ts`, next-intl |
| agent-runner | yes | artifact fields, post outcome, order, key check, redaction | reviewer-core invariants (`agent-runner/CLAUDE.md`): grounding gate, `INJECTION_GUARD` and deterministic gate untouched |
| reviewer-core | no | consumed unchanged | grounding gate and INJECTION_GUARD untouched |
| e2e | yes | new flow `18-ci-runs.flow.json` | deterministic flow |
| shared (vendored) | yes | `eval-ci.ts` CI section and the `adapters.ts` GitHub block, in both copies, Wave 0 only | identical edits; DET-003 accept |

## 3. Contracts

### 3.1 `@devdigest/shared` — `contracts/eval-ci.ts`, section "Export-to-CI + CI Runs" (server + client, byte-identical)
The whole section from `// Export-to-CI + CI Runs` up to `// Conformance` must be identical in both copies. That includes copying the unchanged `AgentManifest` into the client copy and adding the `CiFailOn`/`Provider` imports wherever they are missing.
```ts
export const CiTarget = z.enum(['gha', 'circle', 'jenkins', 'cli']);
export const CiTrigger = z.enum(['opened', 'synchronize', 'reopened']);
export const CiPostAs = z.enum(['github_review', 'pr_comment', 'none']);
export const CiPostOutcome = z.enum(['posted', 'post_failed', 'not_requested']);
/** AC-4 / UT-12 — client duplicates this literal (no value imports in client). */
export const CI_REPO_FULL_NAME_RE = /^[A-Za-z0-9._-]{1,100}\/[A-Za-z0-9._-]{1,100}$/;
export const CiRepoFullName = z.string().regex(CI_REPO_FULL_NAME_RE);
export const CiFileKind = z.enum(['manifest', 'skill', 'memory', 'workflow', 'runner']);
export const CiFile = z.object({
  path: z.string(), kind: CiFileKind,
  contents: z.string().nullable(),          // null only for kind 'runner' in a preview (AC-13)
  bytes: z.number().int(), sha256: z.string().regex(/^[0-9a-f]{64}$/),
  editable: z.boolean(),                    // true only for kind 'workflow' (AC-12)
});
// AgentManifest — unchanged (server copy :313-332), now also in the client copy.
export const CiExportInput = z.object({
  repo: CiRepoFullName,
  target: z.literal('gha').default('gha'),
  post_as: CiPostAs.default('github_review'),
  triggers: z.array(CiTrigger).min(1).max(3).default(['opened', 'synchronize']),
  workflow: z.string().max(65_536).nullish(), // edited workflow; absent → generated
});
export type CiExportInputBody = z.input<typeof CiExportInput>;
export const CiWorkflowViolation = z.object({
  code: z.enum(['invalid_yaml', 'pull_request_target', 'write_permission', 'missing_runner_step']),
  message: z.string(),
});
export const CiWorkflowWarning = z.object({ code: z.literal('unpinned_action'), ref: z.string() });
export const CiPreview = z.object({
  files: z.array(CiFile),
  warnings: z.array(z.string()),            // AC-10 skipped skills, one line each
  workflow_violations: z.array(CiWorkflowViolation),
  workflow_warnings: z.array(CiWorkflowWarning),
  workflow_version: z.string().regex(/^[0-9a-f]{12}$/),
  generator_version: z.number().int(),
});
export const CiInstallationState = z.enum(['pr_open', 'active', 'pr_closed']);
export const CiRunStatus = z.enum(['succeeded', 'no_findings', 'failed']);
export const CiRunSummary = z.object({ status: CiRunStatus, verdict: Verdict.nullable(), ran_at: z.string() });
export const CiInstallation = z.object({
  id: z.string(), agent_id: z.string(), repo: z.string(), target_type: CiTarget,
  github_repo_id: z.number().int().nullable(), manifest_slug: z.string().nullable(), // AC-39, AC-86
  triggers: z.array(CiTrigger), post_as: CiPostAs.nullable(),
  workflow_version: z.string().nullable(), generator_version: z.number().int().nullable(),
  agent_version: z.number().int().nullable(), exported_ci_fail_on: CiFailOn.nullable(),
  pr_url: z.string().nullable(), state: CiInstallationState.nullable(), // null → "unknown"
  outdated: z.boolean(), installed_at: z.string(), updated_at: z.string().nullable(),
  last_refreshed_at: z.string().nullable(), last_run: CiRunSummary.nullable(),
});
export const CiExport = z.object({
  installation: CiInstallation.nullable(), pr_url: z.string().nullable(),
  reused_pr: z.boolean(), warnings: z.array(z.string()), refused_reason: z.string().nullable(),
});
export const CiRun = z.object({
  id: z.string(), ci_installation_id: z.string().nullable(), provider_run_id: z.string(),
  repo: z.string(), pr_number: z.number().int().nullable(), pr_title: z.string().nullable(),
  pr_url: z.string().nullable(), commit_sha: z.string().nullable(),
  agent_id: z.string().nullable(), agent_name: z.string().nullable(), ran_at: z.string(),
  status: CiRunStatus, findings_count: z.number().int().nullable(),
  critical: z.number().int().nullable(), warning: z.number().int().nullable(),
  suggestion: z.number().int().nullable(), verdict: Verdict.nullable(),
  blockers: z.number().int().nullable(), cost_usd: z.number().nullable(),
  duration_ms: z.number().int().nullable(), job_url: z.string().nullable(),
  source: z.literal('gha'), failure_reason: z.string().nullable(),
  agent_run_id: z.string().nullable(), ingested_at: z.string(),
});
/** devdigest-result.json — new fields nullish so old artifacts still parse. */
export const CiResultArtifact = z.object({
  findings_count: z.number().int(), critical: z.number().int().nullish(),
  warning: z.number().int().nullish(), suggestion: z.number().int().nullish(),
  cost_usd: z.number().nullable(), duration_ms: z.number().int().nullish(),
  agent: z.string(), version: z.string().nullish(), pr_number: z.number().int().nullish(),
  verdict: Verdict.nullish(), blockers: z.number().int().nullish(),
  ci_fail_on: CiFailOn.nullish(), post_outcome: CiPostOutcome.nullish(),
});
/** devdigest-run.json — written by the workflow from event context (AC-50). */
export const CiRunMeta = z.object({
  commit_sha: z.string().regex(/^[0-9a-f]{40}$/), repository: z.string().min(1),
  repository_id: z.number().int().positive(), pr_number: z.number().int().positive(),
  pr_title: z.string().max(1024),
});
export const CiSecretStatus = z.object({ name: z.string(), status: z.enum(['set', 'not_set', 'unknown']) });
export const CiTargetOption = z.object({ target: CiTarget, label_key: z.string() });
export const CiRunsQuery = z.object({
  from: z.string().datetime().optional(), to: z.string().datetime().optional(), // default last 7 days
  agent_id: z.string().uuid().optional(), repo: CiRepoFullName.optional(),
  status: CiRunStatus.optional(), source: z.literal('gha').optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export const CiRunsPage = z.object({
  runs: z.array(CiRun), agents: z.array(z.object({ id: z.string(), name: z.string() })), repos: z.array(z.string()),
});
export const CiRefreshInput = z.object({ force: z.boolean().default(false) });
export const CiRefreshResult = z.object({
  checked: z.number().int(), ingested: z.number().int(), failed: z.number().int(),
  skipped_debounced: z.number().int(), degraded: z.boolean(), reason: z.string().nullable(),
});
export const CiErrorReason = z.enum(['provider_not_supported', 'workflow_invalid', 'credential_detected',
  'runner_bundle_missing', 'github_not_connected', 'repo_not_found', 'github_permission', 'pr_create_failed']);
```
Every schema also exports `type X = z.infer<typeof X>`.

### 3.2 `@devdigest/shared` — `adapters.ts` GitHub block (both copies, same added lines)
```ts
export interface RepoInfo { id: number; full_name: string; default_branch: string; html_url: string }
export interface WorkflowRun {
  id: number; run_attempt: number; event: string; status: string; conclusion: string | null;
  head_sha: string; html_url: string; path: string; repository_id: number; repository_full_name: string;
  repository_html_url: string; display_title: string; created_at: string; run_started_at: string | null;
  pull_requests: number[];
}
export interface RunArtifact { id: number; name: string; size_in_bytes: number; expired: boolean }
// added to GitHubClient:
getRepository(repo: RepoRef): Promise<RepoInfo>;
getPullRequestState(repo: RepoRef, n: number): Promise<'open' | 'merged' | 'closed'>;
listWorkflowRuns(repo: RepoRef, opts: { workflowPath: string; perPage?: number }): Promise<WorkflowRun[]>; // event=pull_request, status=completed
listRunArtifacts(repo: RepoRef, runId: number): Promise<RunArtifact[]>;
downloadArtifact(repo: RepoRef, artifactId: number, maxBytes: number): Promise<Uint8Array>; // throws if size_in_bytes > maxBytes before downloading
listRepoSecretNames(repo: RepoRef): Promise<string[] | null>;                 // null on 403
```
Errors thrown by the adapter keep a numeric `status` property (Octokit `RequestError`). Services classify them through `ci/domain/github-errors.ts` and never import an adapter.

### 3.3 Database (`server/src/db/schema/ci.ts`, migration `0020_ci_export.sql`)
**`ci_installations`** adds:
- `workspace_id uuid`, FK workspaces cascade. Backfilled with `UPDATE … FROM agents`, then `SET NOT NULL`.
- Nullable columns:
  - `github_repo_id bigint` (number mode);
  - `manifest_slug text` (AC-39, AC-86);
  - `triggers jsonb` (text[]);
  - `post_as text` (enum CiPostAs);
  - `workflow_version text`;
  - `generator_version integer`;
  - `agent_version integer`;
  - `exported_ci_fail_on text` (enum CiFailOn);
  - `pr_url text`;
  - `state text` (enum CiInstallationState).
- `updated_at timestamptz`, `last_refreshed_at timestamptz`.
- Indexes: unique `(workspace_id, repo)`; `(workspace_id, agent_id)`.

**`ci_runs`** keeps its columns (`github_url` is the job URL) and adds, all nullable:
- `workspace_id uuid`, FK cascade, backfilled via installation → agent;
- `agent_id uuid`, FK agents set null;
- `repo text`, `provider_run_id text`;
- `pr_title`, `pr_url`, `commit_sha`, `agent_name`;
- `critical int`, `warning int`, `suggestion int`, `verdict text`, `blockers int`, `duration_ms int`, `failure_reason text`;
- `agent_run_id uuid`, FK agent_runs set null;
- `ingested_at timestamptz`.
- Indexes: unique `(workspace_id, provider_run_id)`; `(workspace_id, ran_at desc)`; `(agent_id)`.

Readers expose only rows with `workspace_id` and `provider_run_id` set.

### 3.4 Server constants — `server/src/modules/ci/constants.ts` (Wave 0)
```ts
export const WORKFLOW_PATH = '.github/workflows/devdigest-review.yml';
export const WORKFLOW_NAME = 'DevDigest Review'; export const JOB_ID = 'review';
export const REQUIRED_CHECK_NAME = 'DevDigest Review / review';
export const CI_BRANCH = 'devdigest/ci'; export const EXPORT_PR_TITLE = 'Add DevDigest CI review';
export const BASE_DIR = '.devdigest-base';                       // base-commit checkout path
export const RUNNER_DIR = '.devdigest/runner'; export const RUNNER_ENTRY = `${RUNNER_DIR}/index.js`;
export const MEMORY_PATH = '.devdigest/memory.jsonl';
export const agentManifestPath = (slug: string) => `.devdigest/agents/${slug}.yaml`;
export const skillFilePath = (slug: string) => `.devdigest/skills/${slug}.md`;
export const ARTIFACT_NAME = 'devdigest-result';
export const RESULT_FILENAME = 'devdigest-result.json'; export const RUN_META_FILENAME = 'devdigest-run.json';
export const OPENROUTER_SECRET_NAME = 'OPENROUTER_API_KEY';
export const GENERATOR_VERSION = 1;
export const PINNED_ACTIONS = { /* FF constants.ts:55-59 verbatim */ } as const;
export const MAX_ARTIFACT_ZIP_BYTES = 1_048_576; export const MAX_ARTIFACT_ENTRIES = 64;
export const MAX_ARTIFACT_ENTRY_BYTES = 262_144; export const REFRESH_DEBOUNCE_MS = 30_000;
export const BOOTSTRAP_NOTICE = 'DevDigest is not installed on the base branch yet — review skipped';
export const IGNORED_NO_ARTIFACT_CONCLUSIONS = ['success', 'skipped', 'cancelled'] as const; // AC-85
export const CI_FAILURE_REASONS = {
  repoMismatch: 'repository mismatch', metadataMismatch: 'metadata mismatch',
  workflowPath: 'workflow path mismatch', resultSchema: 'schema invalid: devdigest-result.json',
  metaSchema: 'schema invalid: devdigest-run.json', secret: 'secret-shaped content',
  noResult: 'no result artifact', expired: 'artifact expired', tooLarge: 'artifact too large',
  badEntry: 'artifact entry name invalid', postFailed: 'posting to GitHub failed',
} as const;
```

### 3.5 Generated workflow — normative shape (U1 produces it; U3 and U8 rely on it)
Top level:
- `name: DevDigest Review`
- `on: { pull_request: { types: <selected, canonical order> } }`
- `concurrency: { group: devdigest-review-${{ github.event.pull_request.number }}, cancel-in-progress: true }`

Job `review`:
- `runs-on: ubuntu-latest`, `timeout-minutes: 15`
- `if: github.event.pull_request.head.repo.fork == false`
- `permissions`: `{contents: read, pull-requests: write}`, or `{contents: read}` when post-as is `none`

Steps, in order:
1. **Base checkout.** `actions/checkout@<sha> # vX` with `ref: ${{ github.event.pull_request.base.sha }}`, `path: .devdigest-base`, `persist-credentials: false`, `sparse-checkout: .devdigest`.
2. **Bootstrap guard** (`id: guard`, AC-84). A fixed shell script tests `-f .devdigest-base/.devdigest/runner/index.js` and writes `installed=true|false` to `$GITHUB_OUTPUT`. When false it prints `::notice::<BOOTSTRAP_NOTICE>` and exits 0.
3. **Setup node 22**, `if: steps.guard.outputs.installed == 'true'`.
4. **Review** (`id: review`), same `if`. `run: node .devdigest-base/.devdigest/runner/index.js`. env:
   - `OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}`
   - `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`
   - `GITHUB_REPOSITORY`, `PR_NUMBER`
   - `DEVDIGEST_DIR: .devdigest-base/.devdigest`
   - `DEVDIGEST_POST_AS: <value>`
   - `DEVDIGEST_RESULT_PATH: devdigest-result.json`
5. **Write run metadata**, `if: always() && steps.guard.outputs.installed == 'true'` (AC-25). A fixed `node -e` reads `DEVDIGEST_COMMIT_SHA` (`head.sha`), `DEVDIGEST_REPOSITORY`, `DEVDIGEST_REPOSITORY_ID` (`github.event.repository.id`), `DEVDIGEST_PR_NUMBER` and `DEVDIGEST_PR_TITLE` from env and writes `devdigest-run.json`.
6. **Upload artifact.** `upload-artifact`, `name: devdigest-result`, same `if` as step 5, both files, `if-no-files-found: warn`.

Rules:
- No `${{ … }}` expression inside any `run:` value.
- Every `uses:` is `owner/repo@<40hex>` with a `# <tag>` comment.
- Nothing except step 1 precedes the guard (finding 13).

### 3.6 Server ports — `server/src/modules/ci/ports.ts` (created by U6; plain interfaces, no ORM imports)
```ts
export interface CiAgentRecord { id: string; name: string; provider: Provider; model: string; systemPrompt: string;
  strategy: ReviewStrategy; ciFailOn: CiFailOn; version: number }
export interface CiAgentSource { getById(ws: string, id: string): Promise<CiAgentRecord | undefined> }
export interface CiSkillSource { linkedSkills(agentId: string): Promise<{ name: string; body: string; enabled: boolean }[]> } // ordered
export interface CiRepoLookup { findByFullName(ws: string, fullName: string): Promise<{ id: string } | undefined> }
export interface RunnerBundleFile { relPath: string; contents: string }
export interface RunnerBundleSource { load(): Promise<RunnerBundleFile[] | null> }   // null/[] → EC-4
export interface WorkspaceSecretValues { list(): Promise<string[]> }                 // every non-empty stored secret value
export interface GithubConnection { hasToken(): Promise<boolean> }
export interface CiAgentRunWriter { insertCompletedCiRun(i: { workspaceId: string; agentId: string | null;
  model: string | null; ranAt: Date; durationMs: number | null; costUsd: number | null; findingsCount: number;
  blockers: number | null; trace: RunTrace }): Promise<string> }                     // status 'done', source 'ci', pr_id NULL
export interface CiLogger { info(o: object, msg: string): void; warn(o: object, msg: string): void }
export interface CiClock { now(): Date }
export interface CiInstallationRecord { /* = CiInstallation minus outdated/last_run, Dates as Date, + workspaceId */ }
export interface CiRepository {
  findInstallationByRepo(ws: string, repo: string): Promise<CiInstallationRecord | undefined>;
  listInstallations(ws: string, agentId?: string): Promise<CiInstallationRecord[]>;
  upsertInstallation(i: UpsertInstallationInput): Promise<{ record: CiInstallationRecord; created: boolean }>; // keeps an existing manifest_slug
  setInstallationState(id: string, state: CiInstallationState): Promise<void>;
  touchRefreshed(id: string, at: Date): Promise<void>;
  memoryForRepo(ws: string, repoId: string): Promise<{ kind: string; content: string }[]>; // read-only, scope 'repo'
  hasRun(ws: string, providerRunId: string): Promise<boolean>;
  claimRun(i: NewCiRunInput): Promise<string | null>;  // ON CONFLICT (workspace_id, provider_run_id) DO NOTHING
  linkAgentRun(ciRunId: string, agentRunId: string): Promise<void>;
  listRuns(ws: string, q: CiRunsQuery): Promise<CiRunsPage>;
  lastRuns(ws: string, installationIds: string[]): Promise<Map<string, CiRunSummary>>;
  agentNames(ws: string): Promise<{ id: string; name: string }[]>;
}
```
`UpsertInstallationInput` and `NewCiRunInput` mirror the §3.3 columns as plain types.

### 3.7 HTTP endpoints (module `ci`, all workspace-scoped via `getContext`)
| Method · path | Request | Response | Errors |
|---|---|---|---|
| GET `/ci/targets` | — | `CiTargetOption[]` (only `gha`) | — |
| POST `/agents/:id/ci/preview` | `CiExportInput` | 200 `CiPreview`; violations do not fail it | 404 agent · 422 `provider_not_supported` · `credential_detected` (`details.path`) · `runner_bundle_missing` |
| GET `/agents/:id/ci/secrets?repo=` | `repo: CiRepoFullName` | `CiSecretStatus[]` (`OPENROUTER_API_KEY`) | 422 `github_not_connected` · `repo_not_found` |
| POST `/agents/:id/export-ci` | `CiExportInput` | 201 new installation / 200 updated, body `CiExport`; for AC-7: 200 with `refused_reason` and `installation: null` | 422 all reasons above + `workflow_invalid` (`details.violations`) · `github_permission`; 502 `pr_create_failed` |
| POST `/agents/:id/export-ci/archive` | `CiExportInput` | 200 `application/zip`, `Content-Disposition: attachment; filename="devdigest-ci.zip"` | 422 as preview + `workflow_invalid` |
| GET `/agents/:id/ci/installations` | — | `CiInstallation[]` | 404 |
| GET `/ci/runs` | `CiRunsQuery` | `CiRunsPage` | — |
| POST `/ci/refresh` | `CiRefreshInput.nullish().transform(b => b ?? {force:false})` | `CiRefreshResult` | 422 `github_not_connected` |

Errors use `ValidationError(message, { reason, … })` or `ExternalServiceError`. Envelope: `{error:{code,message,details}}` (`server/src/app.ts:158`). Messages (spec text):
- `Agent provider "<p>" is not supported in CI — the CI runner supports OpenRouter only.`
- `Connect GitHub in Settings`
- `Repository not found or not accessible`
- `Runner bundle missing — run pnpm --dir agent-runner build`
- `Credential-shaped content detected in <path>` (the match is never echoed)
- GitHub's own permission message for `github_permission`

### 3.8 Client data layer — `client/src/lib/hooks/ci.ts` (Wave 0) and `api.ts`
`api.ts` adds:
- `postWithStatus<T>(path, body): Promise<{ status: number; data: T }>`
- `postBlob(path, body): Promise<Blob>`, with the same error normalisation as `apiFetch`

Hooks (query keys under `["ci", …]`):
- `useCiTargets()`
- `useCiPreview(agentId, input: CiExportInputBody | null)` — POST used as a query; enabled when input is non-null
- `useCiSecrets(agentId, repo | null)`
- `useExportCi(agentId)` — mutation via `postWithStatus`; invalidates installations
- `useCiArchive(agentId)` — mutation returning a Blob
- `useCiInstallations(agentId)`
- `useCiRuns(query: Partial<CiRunsQuery>)`
- `useRefreshCiRuns()` — mutation `(force: boolean)`; invalidates `["ci","runs"]`

Types come only from `@devdigest/shared`.

### 3.9 UI contract — `ExportWizard` props (U4 produces, U7 consumes)
```ts
export interface ExportWizardProps {
  agentId: string; agentName: string; open: boolean; onClose: () => void;
  initial?: { step: 'target' | 'preview'; repo?: string; triggers?: CiTrigger[]; post_as?: CiPostAs };
}
```
Exported from `CiTab/_components/ExportWizard/index.ts`.

### 3.10 i18n — `client/messages/en/ci.json` (Wave 0 writes every key; units never edit it)
Groups and keys, with the exact spec strings where the spec gives them:

**`runs`**
- Header: title "CI Runs", subtitle "Agent reviews executed inside CI · not local runs", autoRefresh "auto-refresh on", refresh "Refresh", refreshing "Refreshing…".
- States: emptyTitle "No CI runs yet", emptyCta "Set up CI for an agent", noMatches, degraded "Couldn't refresh from GitHub: {reason}".
- filters {last7Days, last30Days, allTime, allAgents, allRepos, allStatuses, allSources}.
- table {timestamp, repo, pullRequest, agent, verdict, findings, cost, duration, status, links}.
- status {succeeded, noFindings, failed}; verdict {approve, comment, request_changes}.
- Links and trace: job "Job", trace "Trace", failureReason "Reason: {reason}", traceTitle, traceUnavailable, sourceGha "GitHub Actions".

**`exportWizard`**
- Frame: title "Export to CI", subtitle, close, back, continue, install, installing "Installing…", steps {target, preview, configure, install}.
- Target: targets {gha "GitHub Actions", ghaDesc}, recommended, repoLabel, repoHint, repoPlaceholder, repoInvalid, openConfig "Open Config tab", targetsError, retry.
- Preview: filesToCreate, generating, editable, readOnly, runnerMeta "{size} · sha256 {hash}", violationsTitle, violations {invalid_yaml, pull_request_target, write_permission, missing_runner_step}, unpinned "Action {ref} is not pinned to a commit SHA", skippedSkills.
- Configure: triggerLabel, triggerRequired "Select at least one trigger", postResultsLabel, postAs {githubReview "GitHub review", prComment "PR comment", none "None (exit code only)"}, secretsHeading, secret {set, notSet, unknown, ready}, requiredCheckNote "A required status check plus Fail CI on blocks merges — no GitHub App needed.", regenerateTitle, regenerateBody, regenerateConfirm, regenerateCancel.
- Install: installPr "Open a PR with these files", installPrBody, installZip "Copy files as a zip", installZipBody, successTitle, viewPr, successReused, exportError, downloadZip.

**`ciTab`**
- Header: heading, subtitle, activeIn "Active in {count, plural, one {# repo} other {# repos}}", addToCi "Add to CI", addRepository "Add repository", updateCiConfig "Update CI config", chooseInstallation.
- Fail CI on: failOnLabel "Fail CI on", failOn {critical "Critical", warning "Warning +", never "Never"}, failOnAnyHint "Any finding — set in the Config tab", failOnError.
- Required check: requiredCheckLabel, copy, copied.
- Installations: emptyTitle "Not in CI yet", emptyBody, githubActions "GitHub Actions", state {pr_open, active, pr_closed, unknown}, version "workflow {version}", versionUnknown "unknown", outdated "outdated", drift "installed: {installed} · current: {current}", noRuns "No runs yet", recentRuns, viewAllRuns.

**`page`**: crumb "CI Runs".

`messages/en/agents.json`: add `editor.tabs.ci` = "CI".

## 4. Work units

### U1 — CI generation domain (pure)
| Field | Value |
|---|---|
| Kind | backend (→ `implementer-backend`) |
| Wave | 1 |
| Depends on | Wave 0 |
| Owns (create/modify) | `server/src/modules/ci/domain/{slug,manifest,memory-jsonl,workflow,workflow-validate,workflow-version,pr-body,targets,file-set}.ts`; `server/test/ci-{manifest,workflow,workflow-validate,pr-body,file-set,targets}.test.ts` |
| Must not touch | `constants.ts` and `domain/secret-scan.ts` (Wave 0); anything outside `modules/ci/domain` |
| Consumes | §3.1, §3.4, §3.5, `domain/secret-scan.ts` |
| Produces | `agentSlug(name)`; `buildAgentManifest` / `renderManifestYaml`; `renderMemoryJsonl(rows)`; `buildWorkflowYaml({triggers, postAs})`; `validateWorkflow(text) → {violations, warnings}`; `workflowVersion(text)`; `renderExportPrBody({repo, triggers, postAs})`; `CI_TARGETS: CiTargetOption[]`; `assembleFileSet({..., manifestSlug}) → {files, warnings} \| {credentialPath}` |
| Checks | `node scripts/agent-check.mjs server <owned files>` · depcruise `--ignore-known` |

**Steps**
1. `agentSlug`: lowercase; runs of characters outside `[a-z0-9]` become `-`; trim; max 64 characters; fallback `agent`. Skill slug = the same function applied to the skill `name`.
2. Manifest: port FF `manifest.ts` (yaml `stringify`). Provider is fixed to `openrouter`; skill slugs keep their order; `ci_fail_on` is included. The output parses with `AgentManifest`.
3. Workflow: port FF `workflow.ts`, then reshape it to §3.5:
   - base checkout, then the guard;
   - concurrency and timeout;
   - env names and sidecar fields;
   - `lineWidth: 0`;
   - a comment on every `uses:`.
4. `validateWorkflow` runs `yaml.parse` on the untrusted text inside try/catch. Rules:
   - `invalid_yaml` — reported alone; no further checks;
   - `pull_request_target` in any `on` form (string, array, map key);
   - `write-all`, or any `write` permission other than `pull-requests`, at workflow or job level → `write_permission`;
   - no step whose `run` contains `node .devdigest-base/.devdigest/runner/index.js` → `missing_runner_step`;
   - each `uses:` not ending `@<40hex>` (`./` paths excluded) → a warning carrying its ref.
5. `assembleFileSet`:
   - drop disabled skills and skills where `hasInjection(body)` (`server/src/modules/_shared/injection.ts:41`); one warning each;
   - manifest path = `agentManifestPath(manifestSlug)`; the caller passes the stored slug, or `agentSlug(name)` on a first export (AC-86);
   - other paths per §3.4;
   - bytes and sha256 for every file; only the workflow is editable;
   - run `containsSecretShapedValue` + `containsKnownSecretValue` over every file, the runner included, and return the first offending path without the match.
6. `renderExportPrBody` contains:
   - the permissions;
   - the triggers;
   - the secrets link `https://github.com/<repo>/settings/secrets/actions`;
   - the fork / skipped-check rule;
   - CODEOWNERS for `.devdigest/**` and `.github/workflows/**`;
   - `REQUIRED_CHECK_NAME`.

**Acceptance criteria**
- [ ] Manifest YAML parses with `AgentManifest`. Name, model, system prompt, strategy, `ci_fail_on` and ordered slugs equal the input; provider is `openrouter` — SPEC-07 AC-9
- [ ] File set paths equal manifest + one skill file per exported skill + memory + workflow + runner files — AC-8. A given `manifestSlug` that differs from `agentSlug(name)` is used verbatim — AC-86 (domain). Disabled + injected skills are absent, with 2 warnings — AC-10. No skill → empty `skills` list and no skill files — EC-10
- [ ] Memory renders one `{kind,content}` JSON line per row (only those keys), or an empty string — AC-11
- [ ] Workflow structure:
  - `on` equals `{pull_request:{types: selected}}` — AC-17;
  - permissions: exactly the two keys for review/comment — AC-18; one key for none — AC-19;
  - every `uses:` pinned with a tag comment — AC-20;
  - job `if` is the fork check — AC-21, EC-23;
  - runner and `DEVDIGEST_DIR` point at the base checkout — AC-22, UT-9;
  - `DEVDIGEST_POST_AS` takes all three values — AC-23;
  - concurrency group keyed by PR number, with cancel — AC-24.
- [ ] Bootstrap guard and sidecar:
  - only the base checkout precedes the guard; it emits `BOOTSTRAP_NOTICE` and exits 0; setup, review, metadata and upload steps are conditioned on its passed output — AC-84, EC-25 (generator);
  - metadata and upload carry `always()` combined with the guard condition — AC-25;
  - the sidecar step env carries head SHA, repo name, numeric repo id, PR number and title — AC-50;
  - `timeout-minutes: 15` — NFR-1.
- [ ] No `${{ github.event` inside any `run:` value — AC-26. A title fixture `$(curl x)` appears only as an env value — UT-2
- [ ] `validateWorkflow`: four hostile fixtures give four violation codes — AC-14 (rules), UT-13. `@v4` gives a warning naming the ref — AC-16
- [ ] Credential fixtures (built at runtime per `server/INSIGHTS.md:70`) in memory or the workflow return the path, never the match — AC-42 (domain), UT-11
- [ ] PR body contains each AC-37 item — AC-37
- [ ] `CI_TARGETS` equals one `gha` entry — AC-3 (domain). Workflow version = first 12 hex of the content's sha256

### U2 — CI ingest domain (pure)
| Field | Value |
|---|---|
| Kind | backend (→ `implementer-backend`) |
| Wave | 1 |
| Depends on | Wave 0 |
| Owns (create/modify) | `server/src/modules/ci/domain/{artifact-zip,verify-run,run-outcome,installation-state,debounce,github-errors}.ts`; `server/test/ci-{artifact-zip,verify-run,run-outcome,installation-state,debounce}.test.ts` |
| Must not touch | U1 files, `constants.ts`, `secret-scan.ts` |
| Consumes | §3.1; §3.2 (`WorkflowRun`, `RunArtifact` types); §3.4; `secret-scan.ts` |
| Produces | `readArtifactZip(bytes) → {result?: string; meta?: string} \| {failure}`; `verifyRun({run, installation, resultText, metaText, secretValues}) → {accepted: true, artifact, meta} \| {accepted: false, reason}`; `decideRunOutcome(run, artifacts) → 'ignore' \| {failure} \| {download: artifactId}`; `ciRunStatus(artifact)`; `installationState({prState, hasIngestedRun})`; `isOutdated(inst, agentVersion)`; `shouldSkipDebounced(lastRefreshedAt, now, force)`; `classifyGithubError(err) → 'not_found' \| 'permission' \| 'rate_limited' \| 'unavailable'` |
| Checks | `node scripts/agent-check.mjs server <owned files>` · depcruise |

**Steps**
1. `readArtifactZip`: `fflate.unzipSync` behind a filter that rejects:
   - more than 64 entries;
   - names other than the two expected files;
   - absolute names or names containing `..` → `badEntry`;
   - entries over 256 KB uncompressed, checked from the central-directory size before inflating → `tooLarge`.
2. `decideRunOutcome`:
   - not completed → `ignore` (EC-15);
   - no `devdigest-result` artifact and conclusion in `IGNORED_NO_ARTIFACT_CONCLUSIONS` → `ignore` (AC-85, EC-25);
   - no artifact with any other conclusion → `noResult` (AC-77, EC-16);
   - expired → `expired`;
   - `size_in_bytes > MAX_ARTIFACT_ZIP_BYTES` → `tooLarge`;
   - otherwise `download`.
3. `verifyRun`, checked in order; return the first failed reason (§3.4):
   1. `run.repository_id === installation.githubRepoId`; null fails → `repoMismatch`;
   2. `run.path` equals `WORKFLOW_PATH` after stripping an `@ref` suffix;
   3. result file present, else `noResult`;
   4. each file's JSON validates against its schema;
   5. sidecar `repository_id` / `repository` equal the installation's, and `commit_sha === run.head_sha` → `metadataMismatch`;
   6. no credential-shaped string or known secret value in either raw text → `secret`.
4. `ciRunStatus`: `post_outcome === 'post_failed'` → `failed` with reason `postFailed`, counts kept. Otherwise `findings_count > 0 ? succeeded : no_findings`.
5. `installationState`: merged → active; closed → pr_closed; open → pr_open, unless an accepted run was ingested (then active).

**Acceptance criteria**
- [ ] One fixture per failed check gives the named reason — SPEC-07 AC-75, AC-77 (reasons), UT-6, EC-19
- [ ] Oversize, extra-entry and bomb fixtures → `failed` reasons — NFR-6. A zip over 1 MB is never downloaded (decision `tooLarge`) — UT-4. A `../x` entry → `badEntry` — UT-5
- [ ] A secret-shaped artifact → `secret`; the returned object contains no matched text — UT-7
- [ ] Not completed → `ignore` — EC-15. A sidecar without a result file → `noResult` — EC-16. Expired → `expired` — EC-17. `post_failed` → failed with counts and verdict kept — EC-18
- [ ] No artifact with conclusion success, skipped or cancelled → `ignore`, three cases — AC-85, EC-25. No artifact with conclusion failure → `noResult` — AC-77, EC-16
- [ ] Three PR states → three installation states — AC-58 (domain). Bumped agent or generator version → outdated true; equal → false — AC-60
- [ ] Debounce: 29 s skips, 31 s runs, force always runs — AC-74, NFR-5 (domain)

### U3 — agent-runner: extended artifact, post outcome, key check
| Field | Value |
|---|---|
| Kind | engine (→ `implementer`) |
| Wave | 1 |
| Depends on | Wave 0 (`CiResultArtifact` extended in the server vendored copy, which the runner aliases) |
| Owns (create/modify) | `agent-runner/src/{artifact,run,index,redact}.ts`; `agent-runner/src/{run,artifact,index}.test.ts` |
| Must not touch | `agent-runner/dist/**`, `.gitignore`, `package.json`, `reviewer-core/**`, `manifest.ts`, `diff.ts` |
| Consumes | §3.1 `CiResultArtifact`, `CiPostOutcome`; §3.5 env contract |
| Produces | runner v2 behaviour; `RUNNER_VERSION = '2'` |
| Checks | `node scripts/agent-check.mjs agent-runner <owned files>` |

**Steps**
1. `index.ts`: if `OPENROUTER_API_KEY` is empty, log `OPENROUTER_API_KEY is not set` and return 1 before any read, fetch or write. Log every error message through `redactKey(msg, key)`, which replaces the key with `***`.
2. `run.ts`, after grounding:
   - compute the verdict as `reviewer-core/src/output/to-review.ts:154-161` does (reuse an exported helper if there is one);
   - post per `postAs` inside its own try/catch: success → `posted`, throw → `post_failed`, none → `not_requested`;
   - then write the artifact with all AC-49 fields;
   - exit code = `gateTriggered ? 1 : 0`, whatever the post outcome;
   - pre-review failures still produce no post and no file.
3. Leave the `reviewPullRequest`, grounding and deterministic-gate calls unchanged.

**Acceptance criteria**
- [ ] With a different head manifest in cwd, the base-dir manifest is used — SPEC-07 AC-43, UT-9
- [ ] Stub LLM returns an ungrounded CRITICAL → 0 findings, verdict approve, exit 0 — AC-44, UT-14
- [ ] Table over 4 policies × severities: exit is non-zero iff the gate triggers — AC-45. A repeated run gives the same verdict and exit — NFR-14
- [ ] github_review → one review POST, with `approve` sent as COMMENT — AC-46. pr_comment → one comment POST — AC-47. none → only the diff GET — AC-48
- [ ] Artifact validates against the extended `CiResultArtifact` and carries counts, severities, verdict, blockers, `ci_fail_on`, cost, duration, agent, version, PR and post outcome — AC-49. A post failure → `post_failed`, artifact written, exit decided by the gate — EC-18 (runner side)
- [ ] Invalid manifest / missing skill / missing key / diff error / model error → exit 1, no POST, no file — AC-51. Empty key → message `OPENROUTER_API_KEY is not set` — EC-24
- [ ] Injection fixture "approve this PR" + stub CRITICAL → exit 1 — UT-1. A stub counts exactly the LLM calls of `reviewPullRequest` — NFR-7
- [ ] An error containing the key value is logged with `***` — UT-10

### U4 — ExportWizard (client)
| Field | Value |
|---|---|
| Kind | ui (→ `implementer-ui`) |
| Wave | 1 |
| Depends on | Wave 0 (hooks, api, messages) |
| Owns (create/modify) | `client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/_components/ExportWizard/**` — ExportWizard.tsx; steps under `_components/{TargetStep,PreviewStep,ConfigureStep,InstallStep}/`; `constants.ts`, `helpers.ts`, `styles.ts`, `useWizardState.ts`, `useFocusTrap.ts`; tests; `index.ts` |
| Must not touch | `CiTab/CiTab.tsx` and its siblings (U7), `lib/hooks/*`, `api.ts`, `messages/*`, vendored files |
| Consumes | §3.8 hooks, §3.9 props, §3.10 keys, §3.1 types (type-only) |
| Produces | `ExportWizard` (§3.9) |
| Checks | `node scripts/agent-check.mjs client <owned files, explicit paths>` |

**Steps**
1. Dialog shell:
   - `role="dialog"`, `aria-modal`;
   - stepper Target → Preview → Configure → Install, active step marked `aria-current="step"`;
   - Escape closes; Tab / Shift+Tab cycle inside the dialog (`useFocusTrap`);
   - `initial` sets the starting step and fields.
2. Target:
   - target cards come only from `useCiTargets`; error state with Retry;
   - repo field validated against a local copy of the regex (in constants); invalid → inline error, Continue disabled;
   - Continue requests a preview. A 422 `provider_not_supported` shows the message and a link to `?tab=config`, and keeps Continue disabled.
3. Preview:
   - list the files; the workflow is a monospace `<textarea>` editor, other files are read-only views;
   - runner rows show size and sha256, no content;
   - workflow edits trigger a debounced (500 ms) preview with `workflow`: violations are listed and disable Continue; warnings are listed and keep it enabled;
   - skipped-skill warnings are shown.
4. Configure:
   - trigger chips, opened and synchronize pre-selected; none selected → message, Continue disabled;
   - three post-as radios, GitHub review default and marked "recommended";
   - secrets from `useCiSecrets` (set / not set / unknown), plus `GITHUB_TOKEN` shown as ready;
   - the required-check note;
   - changing a value after a workflow edit opens a confirm dialog: confirm regenerates (the edit is dropped), cancel restores the previous value.
5. Install:
   - two options, the PR option default and recommended;
   - while pending, Install is disabled and reads "Installing…";
   - success shows the PR link;
   - the zip option downloads `devdigest-ci.zip` via a Blob URL.

**Acceptance criteria**
- [ ] Opens with the 4 steps in order, Target active and marked `aria-current="step"` — SPEC-07 AC-1, NFR-13
- [ ] Cards equal the mocked targets (1 and 2 targets) — AC-2. Regex table → inline error + Continue disabled — AC-4
- [ ] Mocked 422 provider → message, Config link, Continue disabled — AC-6
- [ ] Workflow textarea is editable; the manifest is not — AC-12. Runner row shows size + 64-hex hash and no content — AC-13
- [ ] Mocked violations → each listed, Continue disabled — AC-14 (UI). Unpinned warning shown with Continue enabled — AC-16
- [ ] Configure:
  - default chips — AC-27;
  - none selected → "Select at least one trigger" + Continue disabled — AC-28;
  - three radios with the default checked — AC-29;
  - three secret statuses → three labels, plus GITHUB_TOKEN ready — AC-30;
  - note text present — AC-32.
- [ ] Confirm and cancel paths after an edit — EC-9
- [ ] Two install options, PR default — AC-33. Mocked 201 → PR link, installations query invalidated — AC-40. Pending → "Installing…" + disabled — EC-6
- [ ] Focus cycles inside the dialog — NFR-9. Escape closes — NFR-12. Every string resolves in `ci.json` (a missing key throws) — NFR-8

### U5 — CI Runs page (client)
| Field | Value |
|---|---|
| Kind | ui (→ `implementer-ui`) |
| Wave | 1 |
| Depends on | Wave 0 |
| Owns (create/modify) | `client/src/app/ci-runs/page.tsx`; `client/src/app/ci-runs/_components/CiRunsView/**` — view, `CiRunsTable`, `CiRunsFilters`, `_components/CiRunTraceDrawer/`, `useAutoRefresh.ts`, helpers, constants, styles, tests, `index.ts` |
| Must not touch | `pulls/[number]/_components/RunTraceDrawer/**`, nav, hooks, messages |
| Consumes | `useCiRuns`, `useRefreshCiRuns`, `useRunTrace`, §3.10 |
| Produces | `/ci-runs` route |
| Checks | `node scripts/agent-check.mjs client <owned files>` |

**Steps**
1. Page = `<AppShell crumb>` + `CiRunsView`; keep it thin (pattern from `client/INSIGHTS.md:38`).
2. Header: title and subtitle, "auto-refresh on", and a Refresh button that forces a refresh and reads "Refreshing…" while pending. A degraded refresh shows its reason in a banner above the table.
3. Filters live in URL search params: date range (default last 7 days), agent, repo, status, source. Agent and repo options come from `CiRunsPage.agents` / `repos`.
4. Table:
   - columns: timestamp, repo, PR #number + title (ellipsis with a `title` tooltip), agent, verdict, findings per severity, cost (`formatCost`), duration, status;
   - failed runs show their failure reason;
   - job link (`target=_blank`, `rel="noopener noreferrer"`) and PR link render only for URLs starting `https://github.com/`;
   - the trace link opens `CiRunTraceDrawer(agent_run_id)`;
   - all text renders as plain text.
5. `useAutoRefresh`: a non-forced refresh every 30 s, only while `document.visibilityState === 'visible'`.
6. Empty state: "No CI runs yet" with a "Set up CI for an agent" link to `/agents`. Error handling uses the `!data` guard.

**Acceptance criteria**
- [ ] Route renders title and subtitle — SPEC-07 AC-64 (unit)
- [ ] A fixture row shows every column — AC-65. Job anchor attributes and href — AC-66. Trace click opens the drawer with that run id — AC-67
- [ ] Each filter narrows the fixture rows; the default range is the last 7 days — AC-68. Empty → empty state + link — AC-69
- [ ] Fake timers: refresh `{force:false}` at 30 s; none when the tab is hidden — AC-70. Click → `{force:true}`, label shown while pending — AC-71
- [ ] Failed fixture shows its reason — AC-72. A degraded result shows its reason above the table — EC-14 (UI)
- [ ] Long title truncated, full text in the tooltip — EC-21. A `<img onerror>` title renders as text — UT-3. A `javascript:` job URL renders no link — UT-8. Strings come from `ci.json` — NFR-8

### U6 — CI module: service, repository, routes (export side + reads)
| Field | Value |
|---|---|
| Kind | backend (→ `implementer-backend`) |
| Wave | 2 |
| Depends on | U1, U2, Wave 0 |
| Owns (create/modify) | `server/src/modules/ci/{ports,types,mappers,repository,service,routes}.ts`; `server/src/adapters/ci-bundle/index.ts`; `server/src/platform/container.ts` (ci wiring: `ciService` getter, `ciRepo` override, port adapters); `server/src/modules/index.ts` (register `ci`); tests `server/test/{ci-routes.test.ts,ci-export.it.test.ts,ci-repository.it.test.ts,ci-bundle-scan.test.ts,ci-perf.it.test.ts}` |
| Must not touch | `modules/ci/domain/**`, `constants.ts`, other modules' files, vendored shared, migrations |
| Consumes | §3.1–§3.7, U1 + U2 exports |
| Produces | §3.6 implementations; §3.7 endpoints except `/ci/refresh` |
| Checks | `node scripts/agent-check.mjs server --it <owned files>` · depcruise `--ignore-known` |

**Steps**
1. Container adapters:
   - `CiAgentSource` = `agentsRepo` (structural match);
   - `CiSkillSource` maps `agentsRepo.linkedSkills` (`agents/repository.ts:192`);
   - `CiRepoLookup` = `reposRepo` (`repos/repository.ts:24`);
   - `WorkspaceSecretValues` reads the known keys (OPENAI, ANTHROPIC, OPENROUTER, GITHUB_TOKEN, GITHUB_PAT) via `secrets.get`;
   - `GithubConnection` = GITHUB_TOKEN ?? GITHUB_PAT is present;
   - `FsRunnerBundle(config.ciRunnerBundleDir)`, cached per process.
2. Preview:
   - unknown agent → 404; provider ≠ openrouter → 422;
   - bundle missing → 422;
   - manifest slug = the stored installation's `manifest_slug` if any, else `agentSlug(name)`;
   - memory via repo lookup; empty when the repo is not imported;
   - `assembleFileSet`; a credential hit → 422;
   - validate `input.workflow ?? generated`;
   - runner contents are set to null in the response.
3. Secrets: no token → 422 `github_not_connected`; `getRepository` 404 → 422 `repo_not_found`; `listRepoSecretNames` null → status unknown.
4. Export:
   - the preview checks, then any violation → 422 `workflow_invalid`;
   - another agent already installed in the repo → 200 with `refused_reason` naming it;
   - token check; `getRepository` for id and default branch;
   - `commitFiles({branch: CI_BRANCH, base: default_branch})`;
   - `findOpenPr` → reuse it; otherwise `openPullRequest(EXPORT_PR_TITLE, body)`. A PR failure after the commit → 502 and no row;
   - GitHub 403/404 on writes → 422 `github_permission` / `repo_not_found`;
   - `upsertInstallation` with every AC-39 field including `manifest_slug`, which is kept on update; state `pr_open` → 201 created / 200 updated.
5. Archive: the same generation with full runner contents, zipped with `fflate.zipSync`. No GitHub call, no DB write.
6. Installations = records + `isOutdated(agent.version)` + `lastRuns`. Runs = `listRuns`, default range last 7 days, agent name as stored at ingest.
7. Routes: zod schemas from §3.1 and `IdParams` (`server/src/modules/_shared/schemas.ts:11`). Route tests use `MockAuthProvider` + `MockGitHubClient`.
8. `ci-bundle-scan.test.ts`: load the committed `agent-runner/dist` through `FsRunnerBundle` and scan every file with the Terms pattern list.

**Acceptance criteria**
- [ ] GET `/ci/targets` body equals one `gha` entry — SPEC-07 AC-3
- [ ] `openai` agent → 422 with the provider reason; `openrouter` → 200 — AC-5
- [ ] Install A, then export B to the same repo → `refused_reason` names A — AC-7
- [ ] Preview path set equals the expected set — AC-8. Disabled + injected skills absent, 2 warnings — AC-10. Repo with 2 memory entries → 2 lines; unknown repo → empty — AC-11
- [ ] Export, rename the agent, then preview and re-export → the manifest path is unchanged and only one manifest is committed — AC-86, EC-26
- [ ] Hostile workflow → 422 with violations; the GitHub stub is not called — AC-15, UT-13
- [ ] Secrets stub → set / not set, no value field — AC-31. 403 → unknown — EC-13
- [ ] Export to GitHub:
  - one commit on `devdigest/ci`, base = default branch — AC-34;
  - PR created with the title, head and base — AC-35;
  - every ref write targets `heads/devdigest/ci` — AC-36;
  - an existing open PR → no create, `reused_pr: true` — AC-38;
  - row fields (including `manifest_slug`) equal the request + the stub's repo id — AC-39.
- [ ] Zip entries equal the preview set, with full runner contents — AC-41. Installation count unchanged — AC-82. No PAT or a read-only stub → 200 zip — AC-83
- [ ] Secret-shaped memory → 422 with a body that lacks the value, on preview, export and zip — AC-42, UT-11. Every file of the committed bundle → 0 matches — NFR-15
- [ ] Export failure paths:
  - no token → 422 "Connect GitHub in Settings" on secrets and export, no row — EC-1;
  - stub 403 on a write → 422 with GitHub's message, no row — EC-2;
  - repo 404 → 422 — EC-3;
  - empty bundle dir → 422 with the runner message — EC-4;
  - PR create 500 → 502, no row; a retry then succeeds on the existing branch — EC-5;
  - default branch `trunk` is used as base — EC-7;
  - after a merge (no open PR) → a new PR is opened — EC-8.
- [ ] Bumped agent version → `outdated: true` from GET installations — AC-60 (read)
- [ ] Deleted agent → GET `/ci/runs` still shows the stored name — EC-20
- [ ] `../../x` and `a/b?x=` repos → 422, stub not called — UT-12. Captured logs contain no secret fixture — AC-81 (export side)
- [ ] Preview ≤ 3 s with 10 skills / 200 memory entries — NFR-2. Export ≤ 10 s with a 5 MB bundle and 100 ms stub latency — NFR-3

### U7 — CI tab (client)
| Field | Value |
|---|---|
| Kind | ui (→ `implementer-ui`) |
| Wave | 2 |
| Depends on | U4, Wave 0 |
| Owns (create/modify) | `client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/{CiTab.tsx,CiTab.test.tsx,constants.ts,helpers.ts,styles.ts,index.ts}`; `CiTab/_components/{FailOnControl,InstallationRow,RecentRuns,InstallationPicker}/**`; `AgentEditor/constants.ts` (add the `ci` tab); `AgentEditor/AgentEditor.tsx` (render CiTab) |
| Must not touch | `CiTab/_components/ExportWizard/**` (U4); ConfigTab; `[id]/page.tsx`, which derives its whitelist from `TABS` (`client/INSIGHTS.md:17`) |
| Consumes | `useCiInstallations`, `useCiRuns({agent_id, limit:10})`, `useAgent`, `useUpdateAgent`, `ExportWizard` |
| Produces | CI tab |
| Checks | `node scripts/agent-check.mjs client <owned files>`; before editing tabs, `rg` the tab labels in `e2e/specs/` (`client/INSIGHTS.md:26`) |

**Steps**
1. Header:
   - heading, "Active in N repos" (N = count of `active`), Add to CI;
   - "Update CI config": with several installations, a picker opens first.
2. Fail CI on:
   - radiogroup Critical / Warning + / Never; arrow keys move between options; each label is the accessible name;
   - agent `any` → nothing checked + the hint;
   - selecting → `useUpdateAgent` PUT `{ci_fail_on}`.
3. Required check: `REQUIRED_CHECK_NAME` (a local constant) with a copy button using `navigator.clipboard.writeText`.
4. Installation rows show:
   - repo and "GitHub Actions";
   - a state chip (null → unknown);
   - `workflow {version}` or unknown, plus an outdated marker;
   - last-run verdict with relative time, or "No runs yet";
   - when `exported_ci_fail_on !== agent.ci_fail_on`, the drift text "installed: X · current: Y" with an Update CI config action.
   - Update opens the wizard at Preview, pre-filled. A dashed "Add repository" opens it at Target with an empty repo.
5. Empty state "Not in CI yet" with Add to CI. Recent runs: 10 rows + a link to `/ci-runs?agent_id=<id>`.

**Acceptance criteria**
- [ ] Click Add to CI → wizard dialog at Target — SPEC-07 AC-1 (CI tab side)
- [ ] Agent `warning` → Warning + selected — AC-52. Selecting → `PUT /agents/:id` body `{ci_fail_on}` — AC-53. Arrow keys + accessible names — NFR-10
- [ ] Differing values → drift marker; equal values → none — AC-54. Copy → clipboard receives the name — AC-55
- [ ] Empty list → empty state — AC-56. Fixture installations → every element — AC-57. 2 active + 1 pr_open → "Active in 2 repos" — AC-59
- [ ] Update → wizard at step 2, pre-filled — AC-61. Add repository → step 1, empty repo — AC-62. 12 runs → 10 rows + a link with the agent filter — AC-63
- [ ] Agent `any` → no option checked + hint; selecting Critical PUTs `critical` — EC-11. Several installations → picker first — EC-12. An agent name with HTML renders as text — UT-3. Strings from `ci.json` — NFR-8

### U8 — Refresh / ingest service
| Field | Value |
|---|---|
| Kind | backend (→ `implementer-backend`) |
| Wave | 3 |
| Depends on | U2, U6 |
| Owns (create/modify) | `server/src/modules/ci/refresh-service.ts`; `server/src/modules/ci/routes.ts` (add `POST /ci/refresh`); `server/src/platform/container.ts` (wire `ciRefreshService` and `CiAgentRunWriter`); `server/src/modules/reviews/repository/run.repo.ts` (add `insertCompletedCiRun` only); tests `server/test/{ci-refresh.test.ts,ci-ingest.it.test.ts}` |
| Must not touch | existing functions in `run.repo.ts`, `run-executor.ts`, the multi-run service, `pulls/**`, `pr-history/**`, U6 service logic |
| Consumes | §3.2, §3.6, U2 domain, U6 repository |
| Produces | `POST /ci/refresh` |
| Checks | `node scripts/agent-check.mjs server --it <owned files>` · depcruise |

**Steps**
1. `insertCompletedCiRun` inserts, in one transaction owned by the reviews repository:
   - an `agent_runs` row: `source:'ci'`, `pr_id` null, `status:'done'`, provider `openrouter`;
   - a `run_traces` row: `config.source:'ci'`, empty prompt and log arrays.
2. Refresh: no token → 422. For each workspace installation:
   1. debounce: count it as `skipped_debounced` unless `force`;
   2. `getPullRequestState` from `pr_url` → state;
   3. `listWorkflowRuns(WORKFLOW_PATH)`;
   4. for each run not stored yet: `decideRunOutcome`; `ignore` → nothing stored (AC-85); otherwise `downloadArtifact(…, MAX_ARTIFACT_ZIP_BYTES)` → `readArtifactZip` → `verifyRun`;
   5. `claimRun` with failed or accepted fields; failed runs carry no counts, except EC-18;
   6. accepted → writer + `linkAgentRun`; installation state → active;
   7. `touchRefreshed`.
   - Job and PR URLs come only from run metadata.
3. A GitHub error on one installation (`classifyGithubError`): continue with the rest and return `degraded:true` with the reason; stored rows stay untouched. Transactions hold DB work only (Decision 4).
4. Logging: one structured line with the counts, one line per failed run (`run_id`, reason); no secret values.

**Acceptance criteria**
- [ ] Stub with 2 completed runs → 2 downloads — SPEC-07 AC-73
- [ ] Accepted run → one `ci_runs` row and one `agent_runs` row (`source='ci'`, `pr_id` NULL, `done`, cost, duration, findings) — AC-76
- [ ] Per-check fixtures, plus a `failure` run with no artifact → `failed` rows with the reason and no counts — AC-77, AC-75 (end to end), UT-6, UT-7, EC-16, EC-17, EC-19
- [ ] Three runs with no artifact (success, skipped, cancelled) → 0 rows in `ci_runs` and in `agent_runs` — AC-85, EC-25
- [ ] Refresh twice, then attempt 2 of the same run id → still one row in each table, fields unchanged — AC-78, EC-22
- [ ] Response carries the counts and the degraded flag — AC-79. A URL inside the artifact is ignored; links come from metadata — AC-80. Captured logs contain no secret — AC-81 (ingest side)
- [ ] Stub PR states → three installation states persisted; an ingested run → active — AC-58
- [ ] A non-forced refresh within 30 s → `skipped_debounced`, no GitHub calls — AC-74, NFR-5. ≤ 10 installations / 20 runs at 100 ms latency → ≤ 10 s — NFR-4
- [ ] GitHub 5xx or rate limit → stored runs kept, `degraded:true` + reason — EC-14. In-progress run → nothing stored — EC-15. `post_failed` → failed with counts kept — EC-18
- [ ] No token → 422 — EC-1 (refresh). Log lines as NFR-11 specifies

### U9 — e2e flow: CI Runs via sidebar
| Field | Value |
|---|---|
| Kind | e2e (→ `implementer`) |
| Wave | 3 |
| Depends on | U5, U6, Wave 0 (nav) |
| Owns (create/modify) | `e2e/specs/18-ci-runs.flow.json` |
| Must not touch | other flows; client and server code |
| Consumes | nav item "CI Runs", GET `/ci/runs` |
| Produces | flow 18 |
| Checks | `node scripts/agent-check.mjs e2e e2e/specs/18-ci-runs.flow.json` |

**Steps**
1. Boot, click the sidebar "CI Runs", wait for URL `/ci-runs`, then assert the title, the subtitle and "No CI runs yet" (the seeded DB has no CI runs). Do not click Refresh: the refresh route lands in the same wave.

**Acceptance criteria**
- [ ] Sidebar click → `/ci-runs` with title "CI Runs" and the subtitle — SPEC-07 AC-64 (e2e). The empty state is visible — AC-69

## 5. Waves (execution order)
| Wave | Units | Runs | Why this order |
|---|---|---|---|
| 0 | orchestrator (list below) | sequential, by the orchestrator | contracts, schema, deps, serialized files |
| 1 | U1, U2, U3, U4, U5 | parallel | disjoint files; they only consume Wave 0 |
| 1→2 | orchestrator: `cd agent-runner && npm run build`; remove `dist/` from `agent-runner/.gitignore`; commit `agent-runner/dist/**` | sequential | U6's preview and NFR-15 test read the committed v2 bundle |
| 2 | U6, U7 | parallel | U6 needs U1/U2; U7 needs U4 |
| 3 | U8, U9 | parallel | U8 extends U6's routes and container; U9 needs U5 + U6 |

**Wave 0 tasks (main session)**
1. `cd server && pnpm add yaml`.
2. `scripts/agent-check.mjs`: add `agent-runner` to `PACKAGES` (pnpm; typecheck + vitest related).
3. Vendored contracts: §3.1 into both `eval-ci.ts` copies and §3.2 into both `adapters.ts` copies, identical.
4. Schema and migration:
   - `server/src/db/schema/ci.ts` per §3.3, including `manifest_slug`;
   - `pnpm db:generate --name ci_export` → `0020_ci_export.sql` + meta;
   - hand-add the backfill `UPDATE`s and `SET NOT NULL` to the new file before it is applied;
   - run `pnpm db:migrate` on a throwaway DB (`server/INSIGHTS.md:12`).
5. `server/src/platform/config.ts`: `CI_RUNNER_BUNDLE_DIR` → `ciRunnerBundleDir`, defaulting to the sibling `agent-runner/dist` (FF `config.ts:81-107`).
6. GitHub adapter:
   - `server/src/adapters/github/octokit.ts`: the §3.2 methods; port FF `octokit.ts:387-508`, add the new fields, `getRepository`, `getPullRequestState` and the `maxBytes` check;
   - `server/src/adapters/mocks.ts` `MockGitHubClient`: configurable `repoInfo`, `prStates`, `workflowRuns`, `artifacts`, `artifactZips`, `secretNames`, plus a `calls` recorder (`commitFiles`, `openPullRequest`, ref writes).
7. `server/src/modules/ci/constants.ts` (§3.4) and `server/src/modules/ci/domain/secret-scan.ts` (FF `redact.ts` patterns verbatim, matching the spec Term). Test: `server/test/ci-secret-scan.test.ts` with fixtures built at runtime.
8. `server/test/ci-contract-parity.test.ts`: the CI section is identical in both copies (pattern: `server/test/eval-contract-parity.test.ts`).
9. Client:
   - `src/lib/api.ts` and `src/lib/hooks/ci.ts` (§3.8);
   - `src/vendor/ui/nav.ts`: add `{ key: "ci-runs", label: "CI Runs", icon: <existing IconName>, href: "/ci-runs" }`;
   - `messages/en/ci.json` (§3.10, complete) and `messages/en/agents.json` (`editor.tabs.ci`).
10. Gate: `node scripts/agent-check.mjs server --full`, `client --full`, `agent-runner --full`, plus depcruise.

Serialized files each have one owner: `modules/index.ts` (U6); `container.ts` (U6 in W2, U8 in W3); `api.ts`, messages and vendored files (W0); migration `0020` (W0).

## 6. Test plan
**server unit (no DB)**
- U1 domain tests, including the AC-84 guard ordering, AC-25 conditions and an AC-86 stored-slug case.
- U2 domain tests, including the AC-85 / EC-25 conclusion table and the AC-77 / EC-16 `failure` case.
- Wave 0: secret-scan and contract-parity tests.
- U6 `ci-routes.test.ts`: `app.inject` with `MockAuthProvider` + `MockGitHubClient`, container override `ciRepo`.
- U6 `ci-bundle-scan.test.ts` (NFR-15).
- U8 `ci-refresh.test.ts`: fake clock, a fake for every port.

**server IT** (`*.it.test.ts`, needs Docker)
- U6: `ci-export.it.test.ts` (including rename → re-export, AC-86 / EC-26), `ci-repository.it.test.ts`, `ci-perf.it.test.ts`.
- U8: `ci-ingest.it.test.ts` (including the three no-artifact runs, AC-85).
- Check the skipped count (`server/INSIGHTS.md:59`).

**agent-runner**: U3 `run.test.ts`, `artifact.test.ts`, `index.test.ts`. Hermetic; LLM and fetch stubbed.

**client** (vitest + jsdom, `fetch` mocked, `fireEvent`, real `en` messages that throw on a missing key): U4 wizard step tests, U5 `CiRunsView.test.tsx`, U7 `CiTab.test.tsx`.

**e2e**: U9 flow 18.

**EARS test shapes**
- WHILE rows (AC-54, AC-56, AC-69, AC-70, EC-6, EC-11, NFR-9): test both entering and leaving the state.
- IF rows (including AC-85, AC-77): inject the failure — stub 403/404/500, hostile YAML or zip, runtime-built secrets, conclusion stubs.
- WHERE rows (AC-18/19, AC-46/47/48): run each post-as value.

**Manual (from the spec)**: a demo PR that edits `ci_fail_on` does not change its own verdict (AC-43); inspect the artifact of a demo run (AC-50); the first run on a demo export PR shows the bootstrap notice and is green (AC-84); confirm the required check name (Assumptions).

## 7. Verification (orchestrator, after merge)
1. `node scripts/agent-check.mjs server --full --it`, run on its own (`server/INSIGHTS.md:69`); then `cd server && pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known`.
2. `node scripts/agent-check.mjs client --full` · `node scripts/agent-check.mjs agent-runner --full` · `cd agent-runner && npm run build`, and confirm the committed `dist` is unchanged.
3. `./scripts/e2e.sh` (flows 01–18).
4. `plan-verifier scope=all` → `/pr-self-review`. Accept DET-003 for the vendored edits with the reason "SPEC-07 CI contracts, identical in both copies, parity test".

## 8. Risks
- **Migration.** Existing rows with a duplicate `(workspace_id, repo)` would break the unique index. There are no writers today, so this is unlikely. Do not silently add a defensive `DELETE` of duplicates: if the throwaway migrate fails, stop and ask. Never edit `0000`–`0019`.
- **Vendored drift.** DET-003 will fire. The parity test pins the CI section. The client copy gains `AgentManifest`, used as a type only.
- **depcruise.** `ports.ts` must not import adapters (`server/INSIGHTS.md:37`). `container.ts` must not import a module helper that type-imports `Container` (`:36`). Run depcruise per unit and never grow the baseline.
- **Security-sensitive paths** — `security-reviewer` is mandatory in the review rounds:
  - workflow generator and validator (privilege, injection, guard ordering);
  - artifact unzip (zip bomb, path traversal);
  - secret scan;
  - runner: the grounding gate and deterministic gate must stay untouched; diff-review `run.ts`.
- **Pinned action SHAs** come from FF (2026-08-20). Re-verify each with `gh api repos/actions/<x>/git/ref/tags/<tag>` before merge; a wrong SHA breaks every exported workflow.
- **Orphan agent run** (Decision 4). A crash between claim and link leaves an agent run with `pr_id` NULL (invisible) and a CI run with no trace link. Accepted and documented.
- **Old runner on the base during an update PR.** An old artifact without the new fields still parses (they are nullish). Verdict and post outcome are then null and the UI shows "—".
- **Bundle size.** The 1.6 MB `index.js` goes inline in a Git Data tree under the `commitFiles` timeout (`octokit.ts:264`). Covered by NFR-3 with a 5 MB stub.

## 9. Out of scope
- SPEC-07 Non-goals: CircleCI / Jenkins / CLI generators, fork PRs, push ingest, a marketplace action, several agents per repo, memory in prompts, the Stats tab, removing installations.
- Promoting `RunTraceDrawer` (Decision 7).
- The republish endpoint (removed from the spec).

### Spec follow-ups (owner: user / spec author)
The 2026-10-12 amendment closed earlier follow-ups 1–6: EC-25/AC-85 and the AC-77/EC-16 conclusion rule, the credential-pattern Term + NFR-15, republish removed, AC-53 PUT, and AC-86/EC-26 manifest slug.
1. **AC-84 / Term "Bootstrap guard" — "the first step of the generated job".** The guard checks the base-commit checkout, so the base checkout step has to run before it. The plan places the guard immediately after the base checkout (finding 13). Suggested wording: "the first step after the base-commit checkout".
