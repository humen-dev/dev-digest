# Blast Radius P2/P3 gaps — development plan

| Field | Value |
|---|---|
| Status | draft |
| Goal | A reviewer's Blast radius card (PR → Overview) shows the direct map plus the endpoints and crons reachable through the import graph within `BFS_DEPTH`. The card offers a Tree/Graph toggle with an SVG graph and stat icons, and a collapsible "Prior PRs touching these files" block backed by GitHub. The API log line for each blast request shows that the answer came from the persistent index with no AST parse and no graph build. |
| Packages touched | server · client · shared (vendored, Wave 0) |

## 1. Context

**What exists today (branch L04, after `docs/plans/blast-radius.md` shipped)**

- **Blast module** (`server/src/modules/blast/`):
  - `BlastService.get(workspaceId, prId)` calls `intel.getBlastRadius` once and `intel.getIndexState` once, in parallel (`service.ts:29-32`), then `buildBlastRadius` (`service.ts:34`).
  - The service logs nothing, and its deps have no logger (`ports.ts:24-29`).
  - The route passes only `workspaceId, prId` (`routes.ts:18-21`).
- **Logging pattern to copy (intent):**
  - The route passes `{ logger: req.log }` (`server/src/modules/intent/routes.ts:27`).
  - The service takes `ctx.logger?: OpsLogger` (`intent/ports.ts:76-79`) and emits `ctx.logger?.info({ event: 'intent.classified', …, durationMs }, 'intent classified')` (`intent/service.ts:307-325`).
  - Duration comes from an injectable `now?: () => number` dep (`intent/ports.ts:132`, `intent/service.ts:97-99`).
  - Fastify's logger is pino, level `info` outside tests (`server/src/app.ts:50-59`, `server/src/platform/config.ts:85`).
- **Which path the facade takes:**
  - The persistent path (`repo-intel/service.ts:316-392`) reads only Postgres, always returns `degraded: false` and sets `factsByFile`.
  - The fallback path (`:229-304`) walks and reads every file of the clone through `RipgrepCodeIndex.symbols` (`server/src/adapters/codeindex/ripgrep.ts:99-105`) and returns `degraded: true`.
  - So `blast.degraded` tells the two sources apart.
  - `IndexState` carries `lastIndexedSha` and `indexerVersion` (`repo-intel/types.ts:42-50`). The blast port only picks `status | degradedReason` (`blast/ports.ts:21`).
- **Limits:**
  - `MAX_CALLERS_PER_SYMBOL = 20` (`repo-intel/constants.ts:30`) is injected into blast by the composition root (`server/src/platform/container.ts:46,218-225`).
  - `BFS_DEPTH = 2` (`repo-intel/constants.ts:51`) is used only by `getCriticalPaths`, which follows forward chains from the top-ranked roots and has nothing to do with the PR (`repo-intel/service.ts:671-710`).
  - The import graph is persisted in `file_edges`, which has a reverse-lookup index `file_edges_repo_to_idx (repo_id, to_file)` whose comment says it exists for "who depends on this file?" blast walks (`server/src/db/schema/repo-intel.ts:50-68`).
  - Per-file endpoints and crons are in `file_facts` (`schema/repo-intel.ts:75-88`), read the same way by `RepoIntelRepository.getFileFacts` (`repo-intel/repository.ts:534-549`).
- **Contract:**
  - `BlastRadiusResponse = BlastRadius.extend({stats, unattributed_endpoints, degraded, reason})` (`server/src/vendor/shared/contracts/review-api.ts:146-174`, identical block in `client/src/vendor/shared/contracts/review-api.ts:146-174`). The import on line 3 is `{ BlastRadius, Intent, SmartDiff }`.
  - `PrHistoryItem {pr_number, title, merged_at, author, files_overlap, notes}` / `PrHistory {history}` are at `contracts/brief.ts:64-78` (both copies).
- **Client card** (`client/src/app/repos/[repoId]/pulls/[number]/_components/BlastRadius/`):
  - `BlastRadius.tsx` (130 lines) renders the label and a stat row with "·" separators and no icons (`:65-87`), `DegradedNotice`, the `SymbolRow` list and "Other affected endpoints".
  - It already receives `repoFullName` and `headSha` (`:18-23`).
  - There is no view toggle and no graph. `blast.json` has unused `view.tree|graph` and `graph.empty|ariaLabel` keys (`client/messages/en/blast.json:9-12,42-45`).
  - A segmented radiogroup precedent exists: `DiffTab/_components/OrderToggle/OrderToggle.tsx:11-45`. It is internal to `DiffTab`, so it cannot be imported.
  - Icons `Code`, `CornerDownRight`, `Globe`, `Clock` exist in `@devdigest/ui` (`client/src/vendor/ui/icons.tsx:51,56,72,81`).
  - CSS tokens: `--accent`, `--accent-bg`, `--accent-text`, `--warn`, `--warn-bg`, `--border-strong`, `--text-muted` (`client/src/vendor/ui/styles.css:15-28`).
  - `githubPrUrl` is at `client/src/lib/github-urls.ts:16-18`.
- **GitHub:**
  - `GitHubClient` is a vendored shared port (`server/src/vendor/shared/adapters.ts:150-174`). It is implemented by `OctokitGitHubClient` (`server/src/adapters/github/octokit.ts:29`) and faked by `MockGitHubClient` (`server/src/adapters/mocks.ts:132`).
  - `container.github()` throws `ConfigError` when `GITHUB_TOKEN` is unset (`container.ts:284-291`).
  - Errors: `ExternalServiceError(message, details)` and `ConfigError` (`server/src/platform/errors.ts:31-41`). `withRetry` / `withTimeout` are in `platform/resilience.ts:13,46`.
  - GitHub GraphQL `Commit.history` takes `path` ("filters history to only show commits touching files under this path") and `first`. `Commit.associatedPullRequests(first)` returns the PRs of a commit (https://docs.github.com/en/graphql/reference/commits).
- **No cache pattern** exists for GitHub reads. The only TTL cache is `PriceBook` (`server/src/platform/price-book.ts:29-63`).
- **MCP:** `ApiBlastRadiusSchema` is a non-strict `z.object` (`mcp/src/api/schemas.ts:177`), so the additive optional fields are ignored.

**INSIGHTS relied on:**
- server 2026-09-21: route tests must mock `auth`.
- server 2026-09-22 / 2026-09-27:
  - `ports.ts` may not import ORM, row or adapter types; declare structural shapes locally.
  - Other modules are reachable only via `index|ports|types.ts`.
  - `container.ts` may not import runtime code from a module that type-imports `Container`.
- server 2026-09-29: never trust the facade's own `degraded`/`reason`. `INDEXER_VERSION` bump rule (not triggered here: no indexer change).
- client 2026-09-27: type-only imports from `@devdigest/shared`.
- client 2026-09-23: vendored copies drifted, so edit only the touched block. csstype TS2742 on spread styles.
- client 2026-09-29:
  - gate the error card on `!data`;
  - no `@testing-library/user-event`, use `fireEvent`.
- mcp 2026-09-28: the schema drift check is `Pick`-based.

**What the user asked for:** close P2-a (logs prove an index read), P2-b (BFS depth from constants), P3-a (graph view + toggle + stat icons) and P3-b (Prior PRs block from GitHub).

### Decisions

1. **P2-a: the service logs through a request-scoped logger port, following the intent precedent.**
   - `BlastService.get(ws, prId, ctx: { logger?: BlastLogger } = {})`. The route passes `req.log`.
   - The service emits one `blast.served` record, built by a pure `buildBlastLogRecord`, with:
     - `source` (`persistent_index | ripgrep_fallback | skipped_no_files`)
     - `indexStatus`, `indexerVersion`, `lastIndexedSha`
     - `astParsed: false`, `graphBuilt: false`, `cloneScanned` (true only on the fallback)
     - `edgeQueries`, counts, `bfsDepth`, `maxCallersPerSymbol`, `degraded`, `reason`, `durationMs`
   - *Rejected:* logging in the route. It would need the source and index details, which pushes logic into ring 4, or it would need a meta side-channel.
   - *Rejected:* injecting `app.log` at the composition root. That loses the pino `reqId` binding that ties the line to the request.
2. **P2-b: `BFS_DEPTH` bounds an import-graph walk from the direct caller files.**
   - Hop 1 = direct callers (resolved references, as today). Hops 2..`BFS_DEPTH` = files that import a file reached on the previous hop (reverse `file_edges`, served by `file_edges_repo_to_idx`).
   - Endpoints and crons declared in those files (`file_facts`) that are not already direct become the new per-symbol `indirect` list.
   - Cost: `BFS_DEPTH - 1` edge queries + 1 facts query. There is no parse, `getBlastRadius` is still called exactly once, and the walk runs only on the persistent path.
   - `bfsDepth` is wired from `repo-intel/constants.ts` in `container.ts`, exactly like `maxCallersPerSymbol` (Decision 4 of the parent plan). The server echoes both limits in the response (`limits`), and the UI prints them from data.
   - *Rejected:* `getCriticalPaths`. Its chains start from globally top-ranked files, not from the PR, so using it would be dishonest.
   - *Rejected:* transitive callers-of-callers via `references`. It needs name resolution for caller symbols, which is a second copy of repo-intel logic.
   - *Rejected:* a second `getBlastRadius` call on caller files. It breaks "called once" and is slow.
   - *Rejected:* new `RepoIntel` facade methods. `RepoIntelService` takes the whole `Container` (`repo-intel/service.ts` constructor) and the parent plan kept repo-intel untouched.
   - The reads are two read-only Drizzle queries in `blast/repository.ts`, which already reads `pulls` tables (`blast/repository.ts:10-21`).
3. **The stat row stays "direct impact".**
   - `stats` and `summary` are unchanged, so the demo numbers (2 symbols · 8 callers · 5 endpoints · 1 cron) and the MCP output do not move.
   - Indirect counts travel in a separate `indirect_stats`. The server still computes all numbers (parent Decision 2).
4. **Contract changes are additive and optional** (`limits`, `indirect`, `indirect_stats`, `caller_file_facts` on `BlastRadiusResponse`, plus a new `PrHistoryResponse`).
   - They are optional so that every existing fixture typed as `BlastRadiusResponse` (e.g. `BlastRadius.test.tsx:7-25`, `server/test/contracts.test.ts:179-199`) still compiles after Wave 0.
   - The server always sets them, and U1 tests assert it.
5. **`caller_file_facts` enables honest graph edges.** The response only has per-symbol unions of endpoints, so caller → endpoint edges need per-caller-file facts. The server already has them (`factsByFile`, limited to kept caller files).
   - *Rejected:* drawing an edge from every caller in a group to every endpoint of that group. That over-claims.
6. **P3-b is a separate module and route, `GET /pulls/:id/history`, so blast stays index-only and fast.** One GitHub GraphQL request per lookup:
   - one aliased `history(first: COMMITS_PER_PATH, path: $pN)` block per changed file, on the PR's base ref;
   - `associatedPullRequests(first: 3)` inside each block;
   - capped at `MAX_HISTORY_FILES` most-changed files.
   - Paths travel as GraphQL **variables**, and the aliases are index-generated (`f0..f9`), so repo text never enters the query string.
   - *Rejected:* REST commits-per-path plus `listPullRequestsAssociatedWithCommit`. That is up to 10 + 100 requests.
   - *Rejected:* listing closed PRs and their files. That is N requests and misses older PRs.
   - *Rejected:* the Search API. It cannot filter by file path.
7. **New narrow GitHub port + adapter instead of growing `GitHubClient`.** `PrHistorySourcePort` sits in `modules/pr-history/ports.ts`. `OctokitPrHistorySource` in `src/adapters/github/pr-history.ts` satisfies it structurally, and `MockPrHistorySource` goes in `adapters/mocks.ts`.
   - *Rejected:* adding a method to the vendored `GitHubClient`. It would be a third vendored edit (DET-003) and would force `MockGitHubClient` and `OctokitGitHubClient` changes for one module.
8. **GitHub failures never 500 the card.**
   - The adapter wraps every failure in `ExternalServiceError`, with `details.rateLimited` set for 403/429 or GraphQL `RATE_LIMITED`.
   - The service maps `ConfigError → no_token`, rate-limited → `rate_limited`, anything else → `github_error`, and returns `{ history: [], available: false, reason }` with 200.
   - An unknown or foreign PR is still a 404.
9. **Cache:** a service-level in-memory TTL map keyed `prId:headSha` (10 min, ≤ 200 entries, oldest evicted), modelled on `PriceBook`'s injected-clock TTL. Only `available: true` answers are cached. The client sets `staleTime` 5 min and `retry: false` so it does not hammer GitHub.
10. **`notes` is always `""`.** There is no LLM. The client renders `files_overlap` itself.
11. **Client placement** (frontend-ui-architecture):
    - New children go in `BlastRadius/_components/`: `StatRow`, `ViewToggle`, `BlastGraph` (U3) and `PriorPrs` (U4).
    - The pure layout lives in `BlastGraph/helpers.ts`.
    - `ViewToggle` deliberately duplicates the `OrderToggle` radiogroup pattern (rule 1: tolerate a duplicate. `OrderToggle` is a `DiffTab` internal, and promoting it is out of scope).
    - Pure SVG/React, no new dependency.
    - The graph shows **direct** impact only, like the reference. Indirect impact renders in the tree view (a "Via imports (depth ≤ N)" line per symbol).
12. **MCP is unchanged.** Extra fields are stripped by the non-strict schema. Exposing Prior PRs to MCP needs a port method, schema, fake API, formatter, docs and tests, which is not trivial → §9.

### Open questions
1. **Meaning of "BFS depth 2".**
   - a) Import-graph hops from caller files (Decision 2).
   - b) Callers-of-callers through `references` (needs a repo-intel change).
   - *Default:* a).
2. **Should indirect endpoints and crons count in the stat row?**
   - a) No, shown separately (Decision 3).
   - b) Yes. The demo numbers would change.
   - *Default:* a).
3. **Prior-PR caps.** `MAX_HISTORY_FILES = 10`, `COMMITS_PER_PATH = 10`, `MAX_HISTORY_ITEMS = 10`.
   - *Default:* as listed. Change them in `pr-history/constants.ts`.

## 2. Affected modules
| Package | Touched? | Why / what changes | Architecture rule that applies |
|---|---|---|---|
| server | yes | `blast`: logger port, import-graph walk, limits echo. New `pr-history` module (routes/service/ports/repository/domain/constants), new adapter `adapters/github/pr-history.ts`, `MockPrHistorySource`, registration + container wiring | Onion rings 1-4:<br>- routes are thin<br>- services take narrow ports, never fastify<br>- Drizzle only in `repository.ts`<br>- Octokit only in `src/adapters/`<br>- adapters never import modules (structural typing)<br>- depcruise baseline must not grow |
| client | yes | `BlastRadius` card: `StatRow` (icons + toggle), `ViewToggle`, `BlastGraph` (SVG + pure layout), indirect line in `SymbolRow`, limits footnote. New `PriorPrs` block + `lib/hooks/pr-history.ts` | Frontend-ui-architecture:<br>- colocated `_components/<PascalCase>/` with `index.ts`<br>- pure helpers tested<br>- data only via `src/lib/hooks/*` → `api.ts`<br>- next-intl strings<br>- files ≤ 200 lines |
| reviewer-core | no | — | Grounding gate and INJECTION_GUARD untouched |
| e2e | no | No flow asserts blast text (grep of `e2e/` for "blast": no match) | — |
| mcp | no | Additive optional fields are stripped by `ApiBlastRadiusSchema` (`mcp/src/api/schemas.ts:177`). Wave 0 re-runs its typecheck for the drift check | — |
| shared (vendored) | yes, Wave 0 | `contracts/review-api.ts` in the server and client copies: import line + blast block + new prior-PRs block | Edited identically in every copy, Wave 0 only |

## 3. Contracts (the Interfaces every unit agrees on)

### 3.1 Shared Zod contract (Wave 0; `server/src/vendor/shared/contracts/review-api.ts` AND `client/src/vendor/shared/contracts/review-api.ts`, byte-identical)

Line 3 in both copies becomes:
```ts
import { BlastRadius, Intent, PrHistory, SmartDiff } from './brief.js';
```
Replace the existing `BlastRadiusResponse` block (lines 165-174) with the following and leave `BlastDegradedReason` and `BlastStats` untouched. Then append the prior-PRs block at the end of the file:
```ts
/** Limits the server applied (repo-intel constants.ts) — consumers display them, never hardcode them. */
export const BlastLimits = z.object({
  max_callers_per_symbol: z.number().int().positive(),
  bfs_depth: z.number().int().positive(),
});
export type BlastLimits = z.infer<typeof BlastLimits>;

/** Endpoints/crons reached from a changed symbol only through the import graph (hops 2..bfs_depth). */
export const BlastIndirectImpact = z.object({
  symbol: z.string(),
  /** Importing files reached at hops 2..bfs_depth — sorted ASC, capped. */
  files: z.array(z.string()),
  /** Sorted, deduplicated; excludes this symbol's direct endpoints_affected. */
  endpoints: z.array(z.string()),
  /** Sorted, deduplicated; excludes this symbol's direct crons_affected. */
  crons: z.array(z.string()),
});
export type BlastIndirectImpact = z.infer<typeof BlastIndirectImpact>;

export const BlastIndirectStats = z.object({
  files: z.number().int().nonnegative(),
  endpoints: z.number().int().nonnegative(),
  crons: z.number().int().nonnegative(),
});
export type BlastIndirectStats = z.infer<typeof BlastIndirectStats>;

export const BlastFileFacts = z.object({
  endpoints: z.array(z.string()),
  crons: z.array(z.string()),
});
export type BlastFileFacts = z.infer<typeof BlastFileFacts>;

/** GET /pulls/:id/blast — the BlastRadius map plus index health. Read-only, never calls a model. */
export const BlastRadiusResponse = BlastRadius.extend({
  stats: BlastStats,
  /** Endpoints reached by the change that could not be attributed to one symbol (fallback path). */
  unattributed_endpoints: z.array(z.string()),
  degraded: z.boolean(),
  /** null exactly when degraded === false. */
  reason: BlastDegradedReason.nullable(),
  // --- Additive (docs/plans/blast-radius-p3.md). Optional for wire compatibility; the server always sets them.
  limits: BlastLimits.optional(),
  indirect: z.array(BlastIndirectImpact).optional(),
  indirect_stats: BlastIndirectStats.optional(),
  /** Facts of each kept caller file (persistent index only; {} otherwise) — graph caller → endpoint edges. */
  caller_file_facts: z.record(z.string(), BlastFileFacts).optional(),
});
export type BlastRadiusResponse = z.infer<typeof BlastRadiusResponse>;
```
```ts
/** Why prior-PR history could not be fetched from GitHub. */
export const PrHistoryUnavailableReason = z.enum(['no_token', 'rate_limited', 'github_error']);
export type PrHistoryUnavailableReason = z.infer<typeof PrHistoryUnavailableReason>;

/** GET /pulls/:id/history — merged PRs that touched this PR's changed files. Never calls a model. */
export const PrHistoryResponse = PrHistory.extend({
  /** false when GitHub could not be asked/answered; history is then []. */
  available: z.boolean(),
  /** null exactly when available === true. */
  reason: PrHistoryUnavailableReason.nullable(),
  /** Changed files actually looked up (≤ MAX_HISTORY_FILES). */
  files_considered: z.number().int().nonnegative(),
  files_total: z.number().int().nonnegative(),
});
export type PrHistoryResponse = z.infer<typeof PrHistoryResponse>;
```
The barrels already re-export `review-api.js` (`server/src/vendor/shared/index.ts:18`, `client/src/vendor/shared/index.ts:18`).

### 3.2 `GET /pulls/:id/blast` — semantics added by U1 (everything in `blast-radius.md` §3.2 still holds)
- `limits = { max_callers_per_symbol: deps.maxCallersPerSymbol, bfs_depth: deps.bfsDepth }`, always present, including for an empty file list.
- `caller_file_facts` = `factsByFile` restricted to the files of kept callers (`{}` when `factsByFile` is absent or the file list is empty).
- `indirect` / `indirect_stats` are computed **only when source = `persistent_index`**. Otherwise they are `[]` and `{files:0,endpoints:0,crons:0}`.
  - Walk (I/O in the service, per level, over the union of all groups):
    - `frontier₁` = every kept caller file.
    - For `d = 2..bfsDepth`: `edges += listImporters(repoId, frontier_{d-1})`, and `frontier_d` = the new `fromFile`s not yet seen.
    - The total walked set is capped at `MAX_INDIRECT_FRONTIER`.
    - Then one `getFileFacts(repoId, allReachedFiles)`.
  - Attribution (pure, per group):
    - Run the same BFS over the fetched edges, starting from the group's caller files.
    - Exclude the PR's changed files and the group's caller files.
    - Keep the files sorted ASC and capped at `MAX_INDIRECT_FILES_PER_SYMBOL`.
    - `endpoints` / `crons` = the facts of the kept files minus the group's direct `endpoints_affected` / `crons_affected`.
    - Emit a group only when `files.length > 0`, in `downstream` order.
  - `indirect_stats`:
    - `files` = |∪ files|
    - `endpoints` = |∪ indirect endpoints \ (all direct attributed ∪ unattributed)|
    - `crons` = |∪ indirect crons \ all direct crons|
- `stats`, `summary`, `downstream`, `degraded`, `reason` are unchanged.
- One log record per successful request (not on 404):
  - `logger.info` for `persistent_index` / `skipped_no_files`, `logger.warn` for `ripgrep_fallback`, with message:
    - `'blast radius served from persistent index (no AST parse, no graph build)'`
    - `'blast radius served via ripgrep fallback (index unavailable)'`
    - `'blast radius skipped: no changed files'`
  - Record shape (U1, `domain/blast-log.ts`):
```ts
export interface BlastLogRecord {
  event: 'blast.served';
  prId: string; repoId: string;
  source: 'persistent_index' | 'ripgrep_fallback' | 'skipped_no_files';
  indexStatus: string | null; indexerVersion: number | null; lastIndexedSha: string | null;
  astParsed: false; graphBuilt: false; cloneScanned: boolean;   // cloneScanned === (source === 'ripgrep_fallback')
  changedFiles: number; edgeQueries: number;
  bfsDepth: number; maxCallersPerSymbol: number;
  counts: { symbols: number; callers: number; endpoints: number; crons: number;
            indirectFiles: number; indirectEndpoints: number; indirectCrons: number };
  degraded: boolean; reason: string | null; durationMs: number;
}
```
  - The record contains no file paths, symbol names or secrets.

### 3.3 Blast module-internal types (U1)
```ts
// server/src/modules/blast/ports.ts — additions/changes
export interface BlastImportEdge { fromFile: string; toFile: string }
export interface BlastFileFactsRow { filePath: string; endpoints: string[]; crons: string[] }
export interface BlastRepositoryPort {
  getPull(workspaceId: string, prId: string): Promise<BlastPull | null>;
  listChangedFiles(prId: string): Promise<string[]>;
  /** file_edges rows with to_file IN files for the repo (reverse import lookup). */
  listImporters(repoId: string, files: string[]): Promise<BlastImportEdge[]>;
  /** file_facts rows for the repo and files. */
  getFileFacts(repoId: string, files: string[]): Promise<BlastFileFactsRow[]>;
}
export interface BlastIntelPort {
  getBlastRadius(repoId: string, changedFiles: string[]): Promise<BlastResult>;
  getIndexState(repoId: string): Promise<Pick<IndexState, 'status' | 'degradedReason' | 'lastIndexedSha' | 'indexerVersion'>>;
}
export interface BlastLogger { info(obj: unknown, msg?: string): void; warn(obj: unknown, msg?: string): void }
export interface BlastDeps {
  blast: BlastRepositoryPort; intel: BlastIntelPort;
  repoIntelEnabled: boolean; maxCallersPerSymbol: number; bfsDepth: number;
  now?: () => number;
}
// server/src/modules/blast/constants.ts
export const MAX_INDIRECT_FILES_PER_SYMBOL = 25;
export const MAX_INDIRECT_FRONTIER = 500;
```
The container adds `bfsDepth: BFS_DEPTH`, imported next to `MAX_CALLERS_PER_SYMBOL` from `../modules/repo-intel/constants.js`.

### 3.4 `GET /pulls/:id/history` (U2)
```
GET /pulls/:id/history
  params:  IdParams (uuid)            → 422 on a non-uuid
  config:  rateLimit { max: 30, timeWindow: '1 minute' }
  200:     PrHistoryResponse          (schema.response[200])
  404:     PR not in the caller's workspace
  never 5xx for GitHub/no-token/rate-limit failures → 200 { history: [], available: false, reason }
```
**Semantics:**
- Changed files come from `pr_files`, ordered by `additions + deletions` DESC then `path` ASC. The first `MAX_HISTORY_FILES` are looked up.
- 0 files → `{history:[], available:true, reason:null, files_considered:0, files_total:0}`, with no GitHub call.
- GitHub lookup: base ref = `pull_requests.base`.
- Items:
  - Group by PR number. Drop the current PR number and entries with a null `mergedAt`.
  - `files_overlap` = sorted unique looked-up paths the PR touched.
  - `merged_at` = ISO string. `author` = login or `'unknown'`. `notes` = `''`.
  - Sort by `files_overlap.length` DESC, `merged_at` DESC, `pr_number` DESC. Cap at `MAX_HISTORY_ITEMS`.

```ts
// server/src/modules/pr-history/ports.ts
export interface PrHistoryPull { id: string; number: number; base: string; headSha: string; owner: string; name: string }
export interface PrHistoryChangedFile { path: string; churn: number }
export interface PrHistoryRepositoryPort {
  getPull(workspaceId: string, prId: string): Promise<PrHistoryPull | null>;   // pull_requests ⋈ repos, workspace-scoped
  listChangedFiles(prId: string): Promise<PrHistoryChangedFile[]>;           // churn = additions + deletions
}
export interface MergedPrRef { number: number; title: string; mergedAt: string | null; author: string }
export interface PathPrHits { path: string; prs: MergedPrRef[] }
export interface PrHistoryQuery { owner: string; name: string; ref: string; paths: string[]; commitsPerPath: number }
export interface PrHistorySourcePort { mergedPrsTouchingPaths(q: PrHistoryQuery): Promise<PathPrHits[]> }
export interface PrHistoryLogger { info(obj: unknown, msg?: string): void; warn(obj: unknown, msg?: string): void }
export interface PrHistoryDeps {
  pulls: PrHistoryRepositoryPort;
  /** Throws ConfigError when no GitHub token is configured. */
  github: () => Promise<PrHistorySourcePort>;
  now?: () => number;
}
// server/src/modules/pr-history/constants.ts
export const MAX_HISTORY_FILES = 10;
export const COMMITS_PER_PATH = 10;
export const PRS_PER_COMMIT = 3;
export const MAX_HISTORY_ITEMS = 10;
export const PR_HISTORY_CACHE_TTL_MS = 10 * 60_000;
export const PR_HISTORY_CACHE_MAX = 200;
```
`ContainerOverrides` gains `prHistoryRepo?: PrHistoryRepositoryPort` and `prHistorySource?: PrHistorySourcePort`.

### 3.5 Client hook (U4)
```ts
// client/src/lib/hooks/pr-history.ts
export const prHistoryKey = (prId: string) => ["pr-history", prId] as const;
export function usePrHistory(prId: string | null | undefined): UseQueryResult<PrHistoryResponse>;
//  GET /pulls/:id/history · enabled: !!prId · staleTime: PR_HISTORY_STALE_MS (5 min, module const) · retry: false
```

### 3.6 i18n (Wave 0) — `client/messages/en/blast.json`, full new content
```json
{
  "title": "Blast radius",
  "stat": {
    "symbols": "{count, plural, one {symbol} other {symbols}}",
    "callers": "{count, plural, one {caller} other {callers}}",
    "endpoints": "{count, plural, one {endpoint} other {endpoints}}",
    "crons": "{count, plural, one {cron} other {crons}}"
  },
  "view": {
    "label": "Blast radius view",
    "tree": "Tree",
    "graph": "Graph"
  },
  "callerCount": "{count, plural, one {# caller} other {# callers}}",
  "noDownstream": "{count} changed symbol(s), no downstream callers found.",
  "noChangedSymbols": "No changed symbols found in this PR.",
  "otherEndpoints": "Other affected endpoints",
  "endpointsLabel": "Affected endpoints",
  "cronsLabel": "Affected cron jobs",
  "callerLink": "Open {file} line {line} on GitHub",
  "toggle": {
    "expand": "Expand callers",
    "collapse": "Collapse callers"
  },
  "error": {
    "load": "Couldn't load the blast radius"
  },
  "degraded": {
    "badge": "Index incomplete",
    "reason": {
      "flag_off": "Repo intelligence is disabled on the API (REPO_INTEL_ENABLED=false).",
      "index_failed": "Indexing this repo failed, so results may be missing.",
      "index_partial": "The index is only partial, so some callers may be missing.",
      "repo_too_large": "This repo is too large to index fully, so results may be missing.",
      "no_data": "This repo has not been indexed yet."
    }
  },
  "resync": {
    "button": "Resync index",
    "pending": "Resyncing…",
    "started": "Resync started"
  },
  "limits": "Up to {max} callers per symbol · import depth {depth}",
  "indirect": {
    "label": "Via imports (depth ≤ {depth})",
    "files": "{count, plural, one {# importing file} other {# importing files}}",
    "endpointsLabel": "Endpoints reached via imports",
    "cronsLabel": "Cron jobs reached via imports"
  },
  "graph": {
    "empty": "No downstream callers to graph.",
    "ariaLabel": "Blast radius graph",
    "legend": {
      "changed": "changed symbol",
      "callers": "callers",
      "endpoints": "endpoints affected",
      "crons": "cron jobs"
    },
    "more": "+{count} more",
    "unattributed": "{count, plural, one {# endpoint is} other {# endpoints are}} not linked to a caller. See the Tree view."
  },
  "history": {
    "title": "Prior PRs touching these files",
    "loading": "Loading prior PRs…",
    "empty": "No merged PRs touched these files.",
    "error": "Couldn't load prior PRs",
    "unavailable": {
      "no_token": "Add a GitHub token (GITHUB_TOKEN) to see prior PRs.",
      "rate_limited": "GitHub rate limit reached. Try again later.",
      "github_error": "GitHub history is unavailable right now."
    },
    "merged": "merged {date} by @{author}",
    "overlap": "{count, plural, one {# shared file} other {# shared files}}",
    "moreFiles": "+{count} more",
    "capped": "Checked the {considered} most-changed of {total} files.",
    "openPr": "Open PR #{number} on GitHub"
  }
}
```

## 4. Work units

### U0 — Contracts + i18n (orchestrator)
| Field | Value |
|---|---|
| Kind | backend (contract) + ui (messages) |
| Wave | 0 |
| Depends on | none |
| Owns (create/modify) | `server/src/vendor/shared/contracts/review-api.ts`, `client/src/vendor/shared/contracts/review-api.ts`, `server/test/contracts.test.ts`, `client/messages/en/blast.json` |
| Must not touch | `contracts/brief.ts` (either copy), any other vendored block, `mcp/**` |
| Consumes | `BlastRadius`, `PrHistory` (`brief.ts:39-44,75-78`) |
| Produces | §3.1 schemas, §3.6 messages |
| Checks | `server: pnpm typecheck · pnpm exec vitest run test/contracts.test.ts` · `client: pnpm typecheck · pnpm test` · `mcp: npm run typecheck · npm test` |

**Steps**
1. Apply §3.1 byte-identically to both `review-api.ts` copies: the import line, the replaced `BlastRadiusResponse` block with its new schemas, and the appended prior-PRs block.
2. `contracts.test.ts`:
   - `BlastRadiusResponse` still parses the existing healthy sample without the new fields, and parses one that has `limits`, `indirect`, `indirect_stats` and `caller_file_facts`. It rejects `limits.bfs_depth: 0`.
   - `PrHistoryResponse` parses an available sample and an unavailable sample (`reason: 'rate_limited'`, `history: []`) and rejects `reason: 'bogus'`.
3. Replace `client/messages/en/blast.json` with §3.6. The existing keys keep their values, except that `view.tree`/`view.graph` are recapitalised (they are unused today, per a grep of `BlastRadius/`).
4. Commit Wave 0.

**Acceptance criteria**
- [ ] A `diff` of the two `review-api.ts` files shows only the pre-existing drift (the new blocks are identical).
- [ ] Server contract test, server/client/mcp typecheck and client/mcp tests are green. The existing `BlastRadius.test.tsx` still passes (same strings).

### U1 — Server blast: request log + import-graph depth + limits
| Field | Value |
|---|---|
| Kind | backend |
| Wave | 1 |
| Depends on | U0 |
| Owns (create/modify) | modify `server/src/modules/blast/{ports.ts,service.ts,routes.ts,repository.ts,types.ts,index.ts}`, `server/src/modules/blast/domain/build-blast-radius.ts`; create `server/src/modules/blast/constants.ts`, `server/src/modules/blast/domain/{indirect-impact.ts,blast-log.ts}`; modify `server/src/platform/container.ts`; modify tests `server/test/{blast-domain.test.ts,blast-service.test.ts,blast-routes.test.ts,blast.it.test.ts}`, `server/test/helpers/blast-fakes.ts`; create `server/test/blast-indirect.test.ts` |
| Must not touch | `server/src/modules/repo-intel/**`, `server/src/modules/index.ts`, `server/src/vendor/**`, `server/src/db/**` (no migration), `server/src/adapters/**`, `.dependency-cruiser-known-violations.json` |
| Consumes | §3.1 (`BlastLimits`, `BlastIndirectImpact`, `BlastIndirectStats`, `BlastFileFacts`), `BFS_DEPTH` / `MAX_CALLERS_PER_SYMBOL` (only in `container.ts`), `t.fileEdges` / `t.fileFacts` (`db/schema/repo-intel.ts:55-88`) |
| Produces | §3.2 response fields and log record, §3.3 |
| Checks | `cd server && pnpm typecheck && pnpm exec vitest run test/blast-domain.test.ts test/blast-indirect.test.ts test/blast-service.test.ts test/blast-routes.test.ts && pnpm exec vitest run test/blast.it.test.ts && pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known` |

**Steps**
1. `ports.ts` and `constants.ts` per §3.3. `BlastLogger` is declared locally; do not import intent's `OpsLogger`.
2. `repository.ts`:
   - `listImporters`: select `{fromFile, toFile}` from `file_edges` where `repo_id = $r AND to_file IN (files)` (it hits `file_edges_repo_to_idx`). Return `[]` for empty input.
   - `getFileFacts`: mirror `repo-intel/repository.ts:534-549` (cast jsonb to `string[]`, `?? []`). Return `[]` for empty input.
3. `types.ts`: `BuildBlastOptions` gains `bfsDepth: number`. `build-blast-radius.ts` emits `limits`, `caller_file_facts` (§3.2) and the defaults `indirect: []`, `indirect_stats` zeros. Nothing else changes.
4. `domain/indirect-impact.ts`: `attributeIndirect(response: BlastRadiusResponse, edges: BlastImportEdge[], facts: BlastFileFactsRow[], opts: { bfsDepth: number; changedFiles: string[]; maxFilesPerSymbol: number }): { indirect: BlastIndirectImpact[]; indirect_stats: BlastIndirectStats }`. It is pure and implements §3.2 attribution.
5. `domain/blast-log.ts`: `resolveBlastSource(fileCount, blast)` and `buildBlastLogRecord(input): { record: BlastLogRecord; level: 'info' | 'warn'; message: string }` per §3.2.
6. `service.ts`: `get(workspaceId, prId, ctx: { logger?: BlastLogger } = {})`.
   - Keep the 404 and the empty-files path, which now logs `skipped_no_files`.
   - After the single `Promise.all`, build the base response.
   - If the source is `persistent_index` and `bfsDepth ≥ 2`, run the level loop (§3.2, count `edgeQueries`, cap at `MAX_INDIRECT_FRONTIER`), then `getFileFacts`, then `attributeIndirect`, and merge.
   - Log once via `ctx.logger?.[level](record, message)`. `durationMs` comes from `deps.now ?? Date.now`.
   - No `fastify` import.
7. `routes.ts`: pass `{ logger: req.log }`. No other change.
8. `index.ts`: also re-export `attributeIndirect` and `buildBlastLogRecord`.
9. `container.ts`: import `BFS_DEPTH` alongside `MAX_CALLERS_PER_SYMBOL` and pass `bfsDepth: BFS_DEPTH`.
10. Tests:
    - `blast-fakes.ts`:
      - `InMemoryBlastRepo` gets `seedEdges` / `seedFacts` and implements the two new methods.
      - `FakeRepoIntel` counts `indexRepo` / `refreshIndex` calls (`indexRepoCalls`, `refreshCalls`).
    - `blast-indirect.test.ts` (pure):
      - depth 2 reaches importers of caller files and not their importers' importers;
      - depth 3 does reach them;
      - changed and caller files are excluded;
      - direct endpoints and crons are subtracted;
      - files are sorted and capped at `maxFilesPerSymbol`;
      - no group is emitted when no files are reached;
      - `indirect_stats` dedupes across groups and against unattributed endpoints;
      - the output parses with `BlastRadiusResponse`.
    - `blast-domain.test.ts`:
      - update the `buildBlastRadius` call sites (`bfsDepth`);
      - assert `limits` and that `caller_file_facts` contains only kept caller files, and is `{}` without `factsByFile`;
      - `buildBlastLogRecord` table test for all 3 sources (`astParsed:false`, `graphBuilt:false`, `cloneScanned` only for the fallback; level and message).
    - `blast-service.test.ts`:
      - update the deps (`bfsDepth: 2`, fixed `now`);
      - with a recording logger:
        - the persistent path logs exactly one `info` with `source:'persistent_index'`, `indexerVersion`, `lastIndexedSha`, `edgeQueries: 1` and `counts`;
        - a degraded facade result logs a `warn` with `ripgrep_fallback`, calls `listImporters` 0 times and returns `indirect: []`;
        - `getBlastRadius` is called once;
        - `indexRepoCalls === 0 && refreshCalls === 0`;
        - the indirect endpoint shows up in the response.
    - `blast-routes.test.ts`: the 200 body has `limits: {max_callers_per_symbol: 20, bfs_depth: 2}`.
    - `blast.it.test.ts`: seed `file_edges` + `file_facts` for two repos, and check that `listImporters` / `getFileFacts` are repo-scoped and return plain arrays.

**Acceptance criteria**
- [ ] During `GET /pulls/:id/blast` on an indexed repo, the API log shows one `blast.served` line with `source: "persistent_index"`, `astParsed: false`, `graphBuilt: false`, `cloneScanned: false`, `indexerVersion`, `lastIndexedSha`, counts, `degraded`/`reason` and `durationMs`. The fallback path logs a `warn` with `cloneScanned: true`.
- [ ] `getBlastRadius` is called exactly once per request. Indexing methods are never called.
- [ ] The response carries `limits` from `repo-intel/constants.ts` (`20`, `2`). Indirect impact uses `BFS_DEPTH` from the container, not a literal.
- [ ] `stats` / `summary` are unchanged for the same input (the existing domain assertions still pass).
- [ ] `service.ts` imports neither `fastify` nor `container.ts`. Drizzle appears only in `repository.ts`. Depcruise is green with an unchanged baseline.

### U3 — Client: stat icons, Tree/Graph toggle, SVG graph, indirect + limits
| Field | Value |
|---|---|
| Kind | ui |
| Wave | 1 |
| Depends on | U0 |
| Owns (create/modify) | modify `…/_components/BlastRadius/{BlastRadius.tsx,BlastRadius.test.tsx,constants.ts,helpers.ts,helpers.test.ts,styles.ts}`, `…/BlastRadius/_components/SymbolRow/{SymbolRow.tsx,styles.ts}`; create `…/BlastRadius/_components/StatRow/{StatRow.tsx,styles.ts,index.ts}`, `…/BlastRadius/_components/ViewToggle/{ViewToggle.tsx,styles.ts,index.ts}`, `…/BlastRadius/_components/BlastGraph/{BlastGraph.tsx,BlastGraph.test.tsx,helpers.ts,helpers.test.ts,constants.ts,styles.ts,index.ts}` (all under `client/src/app/repos/[repoId]/pulls/[number]/`) |
| Must not touch | `client/messages/**` (Wave 0 owns it), `client/src/lib/**`, `client/src/vendor/**`, `DiffTab/**` (do not import `OrderToggle`), `OverviewTab/**`, `page.tsx`, `DegradedNotice/**`, `package.json` |
| Consumes | §3.1 types (type-only imports), §3.6 keys, `Icon.Code/CornerDownRight/Globe/Clock` |
| Produces | the `StatRow`, `ViewToggle`, `BlastGraph` components; a `BlastRadius.tsx` render tree with a single content slot after the view, where U4 mounts `PriorPrs` |
| Checks | `cd client && pnpm typecheck && pnpm test` |

**Steps**
1. `constants.ts`: add `BLAST_VIEWS = ["tree", "graph"] as const`, `type BlastView`, `DEFAULT_VIEW: BlastView = "tree"`.
2. `ViewToggle` is a segmented radiogroup (`role="radiogroup"`, `aria-label={t("view.label")}`, two `role="radio"` buttons with `aria-checked`), styled like `OrderToggle/styles.ts`, with labels `view.tree` / `view.graph`. Its props are `{ view, onChange }`.
3. `StatRow` has props `{ stats, view, onViewChange }`.
   - Left side: four stats, each an icon (`Code`, `CornerDownRight`, `Globe`, `Clock`, size 13, `aria-hidden`) + a bold number + the `stat.*` label. The "·" separators are dropped.
   - Right side (`marginLeft: auto`): `ViewToggle`.
4. `BlastGraph/helpers.ts` (pure, no React):
   - `layoutBlastGraph(data: BlastRadiusResponse): GraphLayout`, with exported types `GraphNode {id, kind: 'symbol'|'caller'|'endpoint'|'cron'|'more', label, full, x, y, width}`, `GraphEdge {id, from, to, d}` and `GraphLayout {width, height, nodes, edges, unattributed}`.
   - Columns:
     - `symbol` = `downstream` symbols in server order;
     - `caller` = unique `name|file` in first-seen order, one node per caller even when it calls two symbols;
     - column 3 = endpoints sorted ASC, then crons sorted ASC.
   - Edges:
     - symbol → caller for every caller;
     - caller → endpoint/cron only from `caller_file_facts[caller.file]`.
   - `unattributed` = the number of endpoints in `downstream` ∪ `unattributed_endpoints` with no incoming edge. Those endpoints are not drawn.
   - Per column, at most `MAX_NODES_PER_COLUMN`; the rest collapse into one `more` node (`graph.more`). Edges to hidden nodes are dropped.
   - `truncateLabel(s, max)` appends "…" when longer than `MAX_LABEL_CHARS`; `full` keeps the original.
   - `edgePath(a, b)` = `M x1 y1 C mx y1, mx y2, x2 y2` with `mx` = the horizontal midpoint.
   - Geometry (`COL_X`, `NODE_W`, `ROW_H`, `PAD`, `VIEW_W`, caps) lives in `BlastGraph/constants.ts`. `height = max(column length) * ROW_H + 2 * PAD`.
5. `BlastGraph.tsx`:
   - `<svg role="img" aria-label={t("graph.ariaLabel")} viewBox=… width="100%">`.
   - Edges: grey `path`s (`stroke: var(--border-strong)`, `fill: none`).
   - Node styles:
     - symbols: blue outlined rect (`--accent` stroke, `--accent-bg` fill);
     - callers: neutral (`--border-strong` stroke);
     - endpoints: blue outlined;
     - crons: amber (`--warn` / `--warn-bg`).
   - Mono text, with `<title>{full}</title>` on each node.
   - Below the graph: an HTML legend with swatches and `graph.legend.*`, plus `graph.unattributed` when > 0. When `downstream` is empty, show `graph.empty`.
   - The file stays ≤ 200 lines.
6. `helpers.ts` (card): add `indirectBySymbol(data): Map<string, BlastIndirectImpact>`.
7. `SymbolRow`: new optional props `indirect?: BlastIndirectImpact` and `bfsDepth?: number`. Under the direct chips, when `indirect` has endpoints or crons, render:
   - a label `indirect.label` + `indirect.files`;
   - dashed-border endpoint chips (`aria-label` `indirect.endpointsLabel`) and dashed amber cron chips (`indirect.cronsLabel`).
8. `BlastRadius.tsx`:
   - Add a local `useState<BlastView>(DEFAULT_VIEW)`.
   - Header = title label, then `StatRow`, then `DegradedNotice`.
   - Content = tree (the existing rows + other endpoints, with `indirect` passed per symbol) or `<BlastGraph data={data} />`.
   - Then a `limits` footnote (`t("limits", {max, depth})`) only when `data.limits` exists.
   - Keep the `!data` error guard (client INSIGHTS 2026-09-29). Keep the file ≤ 200 lines (extract a `TreeView` child if needed). Leave one obvious spot after the footnote for U4.
9. Styles: `satisfies CSSProperties` on plain literals only, no spreads into `s` (TS2742 INSIGHTS). SVG presentation attributes may be inline on SVG elements.
10. Tests (`fireEvent`, `NextIntlClientProvider` with `{ blast: messages }`):
    - `BlastGraph/helpers.test.ts`:
      - a shared caller gives 1 node and 2 edges;
      - caller → endpoint edges come only from `caller_file_facts`;
      - the cron node is `kind: 'cron'` and comes after the endpoints;
      - the `more` node beyond the cap;
      - truncation keeps `full`;
      - `edgePath` string format;
      - deterministic x/y and height;
      - an empty `downstream` gives no nodes;
      - `unattributed` count without facts.
    - `BlastGraph.test.tsx`: renders the `img` role, the legend texts and `graph.unattributed`.
    - `BlastRadius.test.tsx` (update):
      - stats render with numbers;
      - the radiogroup defaults to Tree; clicking Graph shows `role="img"` "Blast radius graph" and hides the caller links; clicking Tree restores them;
      - the limits footnote reads "Up to 20 callers per symbol · import depth 2" when present and is absent without `limits`;
      - indirect chips render under the symbol;
      - the existing degraded, empty and error cases still pass.
    - `helpers.test.ts`: `indirectBySymbol`.

**Acceptance criteria**
- [ ] The stat row shows an icon before each of the 4 stats, with a Tree|Graph segmented toggle on its right. Keyboard and screen readers see a radiogroup.
- [ ] Graph view: 3 columns (changed symbols blue outline → callers by name → endpoints blue outline / crons amber), grey cubic edges, long labels ellipsised with a full-text tooltip, and the legend "changed symbol · callers · endpoints affected".
- [ ] No hardcoded 20 or 2 anywhere in the client. Limits come from `data.limits`.
- [ ] No new dependency. Every component file ≤ 200 lines. Every string comes from `blast.json`. Imports from shared are type-only.
- [ ] `pnpm typecheck` and `pnpm test` are green.

### U2 — Server `pr-history` module: `GET /pulls/:id/history` + GitHub GraphQL adapter
| Field | Value |
|---|---|
| Kind | backend |
| Wave | 2 |
| Depends on | U0, U1 (sequenced only because both edit `container.ts`) |
| Owns (create/modify) | create `server/src/modules/pr-history/{routes.ts,service.ts,ports.ts,repository.ts,constants.ts,index.ts}`, `server/src/modules/pr-history/domain/build-history.ts`, `server/src/adapters/github/pr-history.ts`; modify `server/src/adapters/mocks.ts`, `server/src/modules/index.ts`, `server/src/platform/container.ts`; create `server/test/{pr-history-domain.test.ts,pr-history-adapter.test.ts,pr-history-service.test.ts,pr-history-routes.test.ts,pr-history.it.test.ts}` |
| Must not touch | `server/src/adapters/github/octokit.ts`, `server/src/vendor/**` (no `GitHubClient` change), `server/src/modules/blast/**`, `server/src/db/**` (no migration), `package.json` / lockfile (`octokit` is already a dependency), baseline file |
| Consumes | `PrHistoryResponse`, `PrHistoryItem` (§3.1), `IdParams`, `getContext`, `NotFoundError`/`ConfigError`/`ExternalServiceError`, `withRetry`/`withTimeout` |
| Produces | §3.4 endpoint |
| Checks | `cd server && pnpm typecheck && pnpm exec vitest run test/pr-history-domain.test.ts test/pr-history-adapter.test.ts test/pr-history-service.test.ts test/pr-history-routes.test.ts && pnpm exec vitest run test/pr-history.it.test.ts && pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known` |

**Steps**
1. `ports.ts`, `constants.ts` per §3.4. Plain interfaces only; no adapter or ORM imports.
2. `domain/build-history.ts`: `buildPrHistory(hits: PathPrHits[], opts: { currentNumber: number; maxItems: number }): PrHistoryItem[]` per §3.4. It is pure.
3. `repository.ts`: `PrHistoryRepository implements PrHistoryRepositoryPort`.
   - `getPull` joins `pull_requests` → `repos` (`owner`, `name`) where `workspace_id = $ws AND id = $id`.
   - `listChangedFiles` selects `path, additions + deletions` from `pr_files`. It returns port types only.
4. `adapters/github/pr-history.ts`: `OctokitPrHistorySource` with `constructor(token)` and `mergedPrsTouchingPaths(q)`. It satisfies the port structurally (no module import, depcruise `adapters-not-into-modules`). Export pure helpers for tests:
   - `buildHistoryQuery(pathCount)`:
     - GraphQL with variables `$owner,$name,$ref,$n,$k,$p0..$p{n-1}`;
     - `repository(owner,name){ object(expression:$ref){ ... on Commit { f{i}: history(first:$n, path:$p{i}) { nodes { associatedPullRequests(first:$k){ nodes { number title mergedAt author { login } } } } } } } }`;
     - aliases come from indices only, and paths are never interpolated.
   - `parseHistoryResponse(data, paths): PathPrHits[]`: a null repository or object gives `[]`, and each PR is deduped per path.
   - `isRateLimited(err)`: status 403/429 with `x-ratelimit-remaining: '0'`, 429, or GraphQL `errors[].type === 'RATE_LIMITED'`.

   The call goes through `withTimeout(…, 20_000)` inside `withRetry(…, { retries: 1, isRetryable: (e) => !isRateLimited(e) && defaultish 5xx })`. Every thrown error is wrapped as `new ExternalServiceError('GitHub history lookup failed', { rateLimited })`. The token and paths are never logged.
5. `adapters/mocks.ts`: `MockPrHistorySource` with a configurable `hits` or `error`, recording `calls`.
6. `service.ts`: `PrHistoryService.get(workspaceId, prId, ctx: { logger?: PrHistoryLogger } = {})` per §3.4 and Decisions 8-9.
   - The TTL `Map` lives in the service instance, with the clock from `deps.now`.
   - Failure mapping: `ConfigError` → `no_token`; `ExternalServiceError` with `details.rateLimited` → `rate_limited`; anything else → `github_error`. It never rethrows GitHub errors.
   - One log record `{event:'pr_history.served', prId, source: 'cache'|'github'|'skipped_no_files'|'unavailable', items, filesConsidered, filesTotal, reason, durationMs}`.
7. `routes.ts`: `app.get('/pulls/:id/history', { schema: { params: IdParams, response: { 200: PrHistoryResponse } }, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, …)` → `getContext` → `container.prHistoryService.get(workspaceId, req.params.id, { logger: req.log })`.
8. `modules/index.ts`: register `prHistory`.
9. `container.ts`:
   - Add the `prHistoryRepo` and `prHistorySource` overrides.
   - Add a `prHistoryService` getter (`pulls: overrides.prHistoryRepo ?? new PrHistoryRepository(db)`, `github: () => this.prHistorySource()`).
   - Add `async prHistorySource()`: override → cached instance → `secrets.get('GITHUB_TOKEN')` or throw `ConfigError('GITHUB_TOKEN is not configured')` → `new OctokitPrHistorySource(token)`, cached.
   - Clear the cache in `invalidateSecretCaches()`.
10. Tests:
    - `pr-history-domain.test.ts`: excludes the current PR and unmerged entries, merges overlap across paths, sort order and tie-breaks, cap, `notes === ''`, output parses with `PrHistoryItem`.
    - `pr-history-adapter.test.ts`:
      - the query contains `$p0`/`$p1` variables and none of the path text;
      - `parseHistoryResponse` handles a null repository and duplicates;
      - `isRateLimited` truth table.
    - `pr-history-service.test.ts` (in-memory repo + `MockPrHistorySource`):
      - 404 for a foreign PR;
      - no files → no GitHub call;
      - only the top `MAX_HISTORY_FILES` paths by churn are queried, with `ref = base`;
      - no-token (`github` throws `ConfigError`) → `available:false, reason:'no_token'`;
      - a rate-limit error → `rate_limited`;
      - a generic error → `github_error`;
      - a second call within the TTL is served from cache (1 source call) and a call after the TTL fetches again;
      - failures are not cached.
    - `pr-history-routes.test.ts` (`auth: new MockAuthProvider()`, `prHistoryRepo`, `prHistorySource` overrides): 200 parses with `PrHistoryResponse`; 200 `available:false` when the source throws; 404; 422.
    - `pr-history.it.test.ts`: the repository is workspace-scoped, the join returns owner/name, and churn is computed.

**Acceptance criteria**
- [ ] `GET /pulls/:id/history` returns merged PRs (excluding this one) that touched the PR's changed files, with `files_overlap`, from one GraphQL request.
- [ ] No token, rate limit or any GitHub error → HTTP 200 with `history: []`, `available: false` and the matching `reason`. Never a 5xx for these.
- [ ] Repeated requests within 10 min for the same head SHA make no new GitHub call.
- [ ] Octokit is imported only in `src/adapters/github/*`. The adapter imports no module. Depcruise is green with an unchanged baseline.

### U4 — Client "Prior PRs touching these files" block
| Field | Value |
|---|---|
| Kind | ui |
| Wave | 2 |
| Depends on | U0, U3 (mounts into `BlastRadius.tsx`) |
| Owns (create/modify) | create `client/src/lib/hooks/pr-history.ts`; create `…/BlastRadius/_components/PriorPrs/{PriorPrs.tsx,PriorPrs.test.tsx,helpers.ts,helpers.test.ts,styles.ts,index.ts}`; modify `…/BlastRadius/BlastRadius.tsx` (mount only), `…/BlastRadius/BlastRadius.test.tsx` (hook mock only) |
| Must not touch | `client/messages/**`, `client/src/lib/api.ts`, `client/src/lib/hooks/index.ts`, other `BlastRadius` children, `client/src/vendor/**` |
| Consumes | `PrHistoryResponse` (type-only), `GET /pulls/:id/history`, `githubPrUrl` (`lib/github-urls.ts:16`), `Badge`, `Icon.ChevronDown/ChevronRight`, `history.*` keys |
| Produces | `usePrHistory`, `prHistoryKey` (§3.5); the `PriorPrs` component |
| Checks | `cd client && pnpm typecheck && pnpm test` |

**Steps**
1. `lib/hooks/pr-history.ts` per §3.5, mirroring `hooks/blast.ts` (`api.get<PrHistoryResponse>(\`/pulls/${prId}/history\`)`). It is not added to the hooks barrel.
2. `PriorPrs.tsx` (`"use client"`, props `{ prId: string; repoFullName: string | null }`):
   - Header: a `<button aria-expanded>` row with `history.title`, a count `Badge` and a chevron on the right. Collapsed by default (local `useState`).
   - Badge content:
     - `history.length` when available;
     - "…" while loading;
     - "—" when unavailable or errored.
   - Body when open:
     - loading → `history.loading`;
     - no data + error → `history.error` + retry;
     - `available:false` → `history.unavailable.<reason>`;
     - empty → `history.empty`;
     - otherwise one row per item: `#<n> <title>` as an `<a target="_blank" rel="noopener noreferrer">` to `githubPrUrl(repoFullName, n)` (plain text when `repoFullName` is null, with `aria-label` `history.openPr`), then `history.merged` with `{date: mergedDate(merged_at), author}`, then the mono overlap files (first `OVERLAP_PREVIEW` = 3 + `history.moreFiles`) and `history.overlap`.
   - A `history.capped` footnote when `files_considered < files_total`.
   - All titles and authors render as React text only (untrusted GitHub content).
3. `helpers.ts`: `mergedDate(iso)` → `YYYY-MM-DD` (or "—" when invalid) and `overlapPreview(files, max)` → `{shown, more}`. `OVERLAP_PREVIEW` is a module constant.
4. `BlastRadius.tsx`: render `<PriorPrs prId={prId} repoFullName={repoFullName} />` after the view/footnote, in the content state only. `prId` is non-null there. The file stays ≤ 200 lines.
5. `BlastRadius.test.tsx`: add `vi.mock("@/lib/hooks/pr-history", …)` returning an empty available history, so the existing cases keep passing. Add one assertion that the "Prior PRs touching these files" button is present.
6. `PriorPrs.test.tsx` (mock the hook):
   - (1) three items: the badge shows 3, the body is hidden until the header is clicked; then rows show `#12` linking to `https://github.com/acme/widgets/pull/12` with `rel="noopener noreferrer"`, "@alice", the date and "2 shared files";
   - (2) `available:false, reason:'no_token'` → badge "—", GITHUB_TOKEN text after expanding;
   - (3) loading, then error with retry calling `refetch`.
7. `helpers.test.ts`: `mergedDate` (valid/invalid) and `overlapPreview`.

**Acceptance criteria**
- [ ] Inside the Blast radius card, a collapsible row "Prior PRs touching these files [n] ⌄" shows the count badge, and when expanded lists linked PRs with merge date, author and overlapping files.
- [ ] No-token, rate-limit and GitHub errors show a readable message, never a broken card. The blast map still renders.
- [ ] Data comes only through `usePrHistory`. Strings come from `blast.json`. Shared imports are type-only.
- [ ] `pnpm typecheck` and `pnpm test` are green.

## 5. Waves (execution order)
| Wave | Units | Runs | Why this order |
|---|---|---|---|
| 0 | U0 (both `review-api.ts` copies, contract test, `blast.json`) | sequential, by the orchestrator | server and client compile against the contracts, and all new strings exist before the UI units |
| 1 | U1 (server blast), U3 (client graph/toggle/icons) | parallel | disjoint packages. U3 mocks `useBlastRadius`, so it does not need U1 at test time |
| 2 | U2 (server pr-history), U4 (client Prior PRs) | parallel | U2 must follow U1 (both own `container.ts`). U4 must follow U3 (both edit `BlastRadius.tsx` / `BlastRadius.test.tsx`). U2 and U4 are disjoint |

Serialized files:
- `server/src/platform/container.ts`: U1 in Wave 1, U2 in Wave 2.
- `server/src/modules/index.ts` and `server/src/adapters/mocks.ts`: U2 only.
- `client/messages/en/blast.json`: U0 only.
- `**/src/vendor/shared/**`: U0 only.
- `BlastRadius.tsx` / `BlastRadius.test.tsx`: U3 in Wave 1, U4 in Wave 2.

No migration. No unit edits `client/src/lib/api.ts`, any `INSIGHTS.md`, `package.json` or lockfiles. The main session commits after each wave and runs `plan-verifier`.

## 6. Test plan
| Package | Test | Owner |
|---|---|---|
| server | `test/contracts.test.ts`: new optional blast fields, `PrHistoryResponse` accept/reject | U0 |
| server | `test/blast-domain.test.ts` (limits, `caller_file_facts`, log record table), `test/blast-indirect.test.ts` (pure BFS attribution) | U1 |
| server | `test/blast-service.test.ts`: log record per source, single facade call, no indexing, edge-query count, fallback skips the walk | U1 |
| server | `test/blast-routes.test.ts` (limits in the body), `test/blast.it.test.ts` (`listImporters` / `getFileFacts` repo scoping, Postgres) | U1 |
| server | `test/pr-history-domain.test.ts`, `test/pr-history-adapter.test.ts` (query/parse/rate-limit, no network) | U2 |
| server | `test/pr-history-service.test.ts` (fake GitHub port: no-token/rate-limit/error/cache/caps), `test/pr-history-routes.test.ts` (`app.inject`, no DB), `test/pr-history.it.test.ts` (Postgres) | U2 |
| client | `BlastGraph/helpers.test.ts`, `BlastGraph.test.tsx`, `BlastRadius.test.tsx` (toggle/limits/indirect), `helpers.test.ts` | U3 |
| client | `PriorPrs.test.tsx`, `PriorPrs/helpers.test.ts`, `BlastRadius.test.tsx` (hook mock + mount) | U4 |
| mcp | unchanged suite re-run in Wave 0 (type-only drift check) | U0 |
| e2e | none (§9) | — |

## 7. Verification (orchestrator, after merge)

**Automated:**
```bash
cd server && pnpm typecheck && pnpm test && pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known
cd client && pnpm typecheck && pnpm test
cd mcp && npm run typecheck && npm test
```
Then run `/pr-self-review`. Accept DET-003 for the two `src/vendor/shared/contracts/review-api.ts` edits (§8).

**Manual, on the private demo repo `humen-dev/blast-radius-demo`, PR #1 (formatMoney / roundCents):**
1. Setup: run `./scripts/dev.sh` (GITHUB_TOKEN configured, `REPO_INTEL_ENABLED` unset). Make sure the repo is imported and `GET /repos/<id>/index-state` reports `status: "full"` with `indexerVersion: 3` (resync first if older).
2. **P2-a log.** Open PR #1 → Overview. In the API terminal, find exactly one `blast.served` line for the request:
   - `source: "persistent_index"`, `astParsed: false`, `graphBuilt: false`, `cloneScanned: false`;
   - `indexerVersion: 3` and `lastIndexedSha` equal to the index-state value;
   - `counts.symbols: 2`, `counts.callers: 8`, `counts.endpoints: 5`, `counts.crons: 1`;
   - `edgeQueries: 1`, `bfsDepth: 2`, `maxCallersPerSymbol: 20`, `degraded: false`, a `durationMs` of tens of ms.

   No `repo-intel-index` / `repo-intel-resync` job lines appear during the request. Optional contrast: restart with `REPO_INTEL_ENABLED=false` → a `warn` line with `source: "ripgrep_fallback"`, `cloneScanned: true`.
3. **P2-b limits.**
   - The card footnote reads "Up to 20 callers per symbol · import depth 2".
   - `GET /pulls/<id>/blast` has `limits: {max_callers_per_symbol: 20, bfs_depth: 2}` and `indirect_stats`.
   - The stat row still says 2 symbols · 8 callers · 5 endpoints · 1 cron.
   - If files importing the callers declare extra routes, their symbol row shows "Via imports (depth ≤ 2)" chips. On this small demo `indirect` may legitimately be empty; the log's `indirectFiles` shows how many importers were reached.
4. **P3-a.**
   - The stat row shows the four icons and a Tree|Graph toggle on the right.
   - Click **Graph**: 2 blue-outlined symbol nodes → 8 caller nodes (a caller of both symbols appears once, with two edges) → 5 blue endpoint nodes (long paths ellipsised, hover shows the full text) + 1 amber cron node, joined by curved grey edges, with the legend underneath.
   - Click **Tree** to return.
5. **P3-b.** The row "Prior PRs touching these files [n] ⌄" is present. With today's history (one merged PR, likely unrelated to `src/lib/money.ts`) the badge shows 0 and the expanded body shows "No merged PRs touched these files." That is correct. To prove a positive:
   - a) On `main`, open PR #2 that edits a line of the file(s) PR #1 changes (e.g. `src/lib/money.ts`), such as a comment at the top far from PR #1's hunks to avoid conflicts. Merge it (squash or merge commit).
   - b) Open and merge PR #3 that only edits `README.md` (negative control).
   - c) Reload PR #1 → Overview after the 10-minute server cache or after an API restart. Expanded, the list shows `#2` with "1 shared file" `src/lib/money.ts`, a merge date and the author. `#3` is absent, and `#1` itself never appears.
   - d) Optional: remove the token from `~/.devdigest/secrets.json` and restart the API → the badge shows "—" and the body shows the GITHUB_TOKEN message, while the blast map still renders. Restore the token afterwards. The rate-limit path is covered by `pr-history-service.test.ts`.

## 8. Risks
- **Vendored-contract drift / DET-003.** Wave 0 edits both `contracts/review-api.ts` copies, and pr-self-review DET-003 will flag them. Accept with `pr-self-review.mjs accept "<key>" --reason "blast-radius-p3: additive BlastLimits/BlastIndirect*/caller_file_facts + PrHistoryResponse, applied identically to server and client copies; vendored copy is the source (client/INSIGHTS 2026-09-23)"`. Mitigation: U0 diffs the blocks.
- **Optional fields hide a missing server value.** A server regression that stops emitting `limits` would silently hide the footnote. Mitigation: U1's route and service tests assert that the fields are always present.
- **Blast reads repo-intel tables directly** (`file_edges`, `file_facts`), so it is coupled to their shape. Mitigation: read-only queries in `blast/repository.ts` only, covered by `blast.it.test.ts`, and the same pattern as `RepoIntelRepository.getFileFacts`. A schema change would need a migration, which would surface there.
- **Import-graph over-approximation.** A file that imports a caller file may not call the affected caller. That is why indirect impact is labelled "via imports", kept out of `stats`, and capped (Open question 1).
- **GitHub cost / rate limits.** One GraphQL query per PR per 10 min (per head SHA), plus a route rate limit of 30/min. Rate limits map to `rate_limited`, never a 500. GraphQL node count ≤ 10 × 10 × 3.
- **Untrusted content.** PR titles, authors and file paths are rendered as React text. PR links are built from the numeric `pr_number` via `githubPrUrl`. GraphQL paths are passed only as variables. Logs carry counts, not paths or tokens. Routes are workspace-scoped (404 for a foreign PR).
- **Depcruise.** Watch for:
  - the adapter must not import the module port (structural typing, INSIGHTS 2026-09-27);
  - `ports.ts` must not import adapters;
  - `service.ts` must not import `fastify`;
  - `container.ts` imports only `repository`/`service`/`ports` and constants, as today.

  Never grow the baseline.
- **Stale graph edges.** Caller lines and facts come from the default-branch index (`lastIndexedSha`). Same caveat as parent plan Risk 2.
- **No migration**, so no numbering risk. reviewer-core, the grounding gate and INJECTION_GUARD are untouched.

## 9. Out of scope
- Exposing Prior PRs or indirect impact through MCP `get_blast_radius` (Decision 12). Candidate follow-up unit: `getPrHistory` port method + schema + formatter + tests.
- An e2e flow for the card (parent plan §9 still applies).
- Changes to repo-intel: per-symbol cap in the facade, hunk-level symbol filtering, transitive callers through `references` (Open question 1 b).
- Promoting `OrderToggle` / `ViewToggle` into `@devdigest/ui`.
- LLM-written `notes` for prior PRs, and populating `PrBrief.history` / `PrBrief.blast`.
- Persisting prior-PR history in Postgres (in-memory TTL only; a restart refetches).
