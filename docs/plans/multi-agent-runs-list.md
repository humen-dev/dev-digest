# Multi-Agent Review — runs list (SPEC-07 revision 2026-10-12) — development plan

| Field | Value |
|---|---|
| Status | approved (2026-10-12 by user: execution shape, mode and test policy pre-approved) |
| Goal | The "Multi-Agent Review" sidebar item opens a paged list of the workspace's multi-agent runs (state, time, cost, agents); any run opens in one click, and Configure run is reachable from the list. |
| Requirements source | [`specs/2026-10-12-multi-agent-review.md`](../../specs/2026-10-12-multi-agent-review.md) (SPEC-07, `Status: approved`), **runs-list revision only**: US-11, G-8, AC-75 – AC-92, EC-16 – EC-23, NFR-12 – NFR-15, UT-11 – UT-14 (AC-67/AC-68 removed). The rest of SPEC-07 is done ([`multi-agent-review.md`](./multi-agent-review.md)). |
| Execution mode | single-agent (sequential pass) — chosen by the user |
| Packages touched | server · client · shared (vendored, both copies) |

## 1. Context
- The sidebar entry auto-redirects to the latest run, or to Configure run (`client/src/app/multi-agent/_components/MultiAgentEntry/MultiAgentEntry.tsx:17-20`) via `useLatestMultiAgentRun` (`client/src/lib/hooks/multi-agent.ts:74-79`). The page is a thin wrapper (`client/src/app/multi-agent/page.tsx:4-6`).
- The API has only latest-run pointers (`server/src/modules/reviews/routes.ts:77-85`); no list or paged endpoint exists.
- Reusable pieces: `MultiAgentService` + `toRunStatus` (`server/src/modules/reviews/multi-agent-service.ts:29-31`, `:38`); pure `computeTotals` (AC-61/AC-62 rules, `server/src/modules/reviews/domain/multi-agent-totals.ts:11-30`; with 0 runs it yields 0 ms / null cost / 0 unpriced, which is exactly EC-16); "Unknown agent" constant (`multi-agent-service.ts:20`); column order `agent_runs.ran_at, id` (`repository/multi-agent.repo.ts:108`).
- Indexes for the page read exist: `multi_agent_runs_ws_ran_at_idx (workspace_id, ran_at DESC)` and `agent_runs_multi_run_id_idx` (`server/src/db/migrations/0020_multi_agent_review.sql:4-5`, `server/src/db/schema/runs.ts:38`, `:59`). **No migration needed (confirmed).**
- `pull_requests.repo_id` is NOT NULL (`server/src/db/schema/pulls.ts:12-14`); `repos.full_name` exists (`server/src/db/schema/repos.ts:14`).
- Client: breadcrumbs already link to `/multi-agent` on Configure run (`configure/_components/ConfigureRun/ConfigureRun.tsx:32`) and results (`[prId]/_components/MultiAgentResults/MultiAgentResults.tsx:72-75`), so AC-92 is already met. The unpriced cost rendering exists in `ResultsHeader.tsx:35-39` with key `results.unpriced` (`client/messages/en/multiAgent.json:38`). Helpers: `formatCost` (`client/src/lib/format-cost.ts:12`), `formatSeconds` (`client/src/lib/multi-agent-selection.ts:34`), `relativeTime` (`client/src/lib/relative-time.ts:2`), URL builders (`client/src/lib/multi-agent-urls.ts:4-16`).
- No existing test file covers multi-agent code, server or client (`rg MultiAgentService server/test` and `rg multi-agent client/src --glob '*.test.*'` → 0). No e2e flow references `/multi-agent` (`rg multi-agent e2e` → 0).
- INSIGHTS relied on: client 2026-10-12 (the orchestrator does file moves), 2026-09-29 (error state gated on `!data`), 2026-09-27 (type-only `@devdigest/shared` imports), 2026-09-23 (vendored copies drift; edit only the touched block); server 2026-09-22 (plain interfaces in `ports.ts`), 2026-10-07 (route-level rate limits; the global one is 1000/min).

### Requirements review
Approved-spec fast path (feasibility + testability only). Nothing is blocking.
1. **Test policy (user decision):** no new test files in this workflow. Every spec "Verify by" (unit / integration) is checked by code inspection in `plan-verifier` plus the existing suites. The AC → evidence mapping is in §6.
2. **NFR-12 query count:** `getContext()` can issue one auth query (`LocalNoAuthProvider`, server INSIGHTS 2026-09-21). The design uses 2 queries for the page (runs page + agent runs), so the total stays ≤ 3 even when the auth query is counted.
3. **EC-22, NFR-15** are manual by spec (§7 Phase 5).
4. **AC-92** is already implemented (evidence above). U2 only confirms it is unchanged.
5. **EC-23** is covered by AC-89 + AC-90 by spec; nothing extra.

Recommendations: none.

### Decisions
1. **Repository name = `repos.full_name`** (`owner/name`). Rejected: `repos.name`. Two owners can have a repo with the same name in one workspace, and UX-8 exists to disambiguate rows.
2. **Cursor = base64url(JSON `{t, id}`)**, where `t` is the run's `ran_at` as UTC text with **microsecond** precision, read in SQL via `to_char(... AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`. Rejected: a JS `Date` ISO string, because `ran_at` (`defaultNow()`) has µs precision and a ms-truncated keyset repeats or skips rows (EC-20, AC-76). The cursor holds no workspace id; the workspace filter always comes from `getContext` (UT-13).
3. **Page read = 2 queries:** (a) `multi_agent_runs ⋈ pull_requests ⋈ repos`, workspace-scoped, keyset `(ran_at, id) < (t, id)`, `ORDER BY ran_at DESC, id DESC LIMIT limit+1`; (b) `agent_runs ⟕ agents WHERE multi_run_id IN (…)` ordered by `ran_at, id`. Query (b) is skipped for an empty page. `findings` and `reviews` are never touched (NFR-13). `limit+1` yields `next_cursor = null` exactly when no older run exists (AC-76).
4. **Overall state** is a pure domain function over contract statuses (after `toRunStatus`). `failed_count` = number of `failed` + `cancelled` agent runs, always returned; the UI shows it only for `failed` (AC-79).
5. **Malformed cursor → `ValidationError` (422)** thrown by the service after a pure decode. `limit` is validated by the route's zod querystring (422 before the handler, `server/AGENTS.md`).
6. **Client paging = TanStack `useInfiniteQuery`.** A refetch re-requests the loaded pages in order and recomputes cursors from fresh data, which serves AC-89 without stale cursors. Rejected: hand-rolled page state in `useState` (server data copied into state).
7. **Folder rename by the orchestrator (U0):** `MultiAgentEntry/` → `MultiAgentRunsList/` via `git mv`, because implementers cannot move or delete files (client INSIGHTS 2026-10-12). `useLatestMultiAgentRun` is removed (no caller after U2). `GET /multi-agent/latest` stays on the server (spec Compatibility).
8. **Unpriced cost formatting is duplicated** in the list helper rather than promoting `ResultsHeader`'s inline logic. Promoting it would make U2 edit the results route (frontend-ui-architecture rule 1 tolerates the copy). Both use the same key `results.unpriced` + `formatCost`.

### Open questions
none

## 2. Affected modules
| Package | Touched? | Why / what changes | Architecture rule that applies |
|---|---|---|---|
| server | yes | `GET /multi-agent/runs` in the `reviews` module: route, service method, 2 repo reads, 2 pure domain files | onion: routes (4) → service (2) → ports (2) ← repository (3); domain (1) pure |
| client | yes | list page replaces the redirect; infinite-query hook; i18n keys | frontend-ui-architecture: thin page, `_components/MultiAgentRunsList/`, hook in `src/lib/hooks` |
| reviewer-core | no | — | grounding gate / INJECTION_GUARD untouched |
| e2e | no | no flow references `/multi-agent` | — |
| shared (vendored) | yes | additive list contracts in `contracts/observability.ts`, both copies, identical | Wave 0 only (U0) |

`ci/`, `agent-runner/`, `reviewer-core/`, `mcp/` are untouched.

## 3. Contracts

### 3.1 Vendored Zod — `contracts/observability.ts` (both copies, identical; insert after `MultiAgentRunRef`)
```ts
/** Overall state of a multi-agent run in the runs list (SPEC-07 AC-79). */
export const MultiAgentOverallState = z.enum(['running', 'done', 'failed']);
export type MultiAgentOverallState = z.infer<typeof MultiAgentOverallState>;

/** One agent run of a listed multi-agent run, in column order. */
export const MultiAgentRunsListAgent = z.object({
  /** "Unknown agent" when the agent was deleted (EC-17). */
  agent_name: z.string(),
  status: AgentRunStatus,
});
export type MultiAgentRunsListAgent = z.infer<typeof MultiAgentRunsListAgent>;

/** One row of GET /multi-agent/runs (AC-77). Totals follow AC-61/AC-62. */
export const MultiAgentRunsListItem = z.object({
  id: z.string(),
  pr_id: z.string(),
  pr_number: z.number().int(),
  pr_title: z.string(),
  /** repos.full_name ("owner/name"). */
  repo_name: z.string(),
  ran_at: z.string(),
  state: MultiAgentOverallState,
  /** Agent runs that are failed or cancelled. */
  failed_count: z.number().int(),
  agent_count: z.number().int(),
  total_duration_ms: z.number().int(),
  /** Sum of known cost_usd; null when none is known. */
  total_cost_usd: z.number().nullable(),
  unpriced_count: z.number().int(),
  agents: z.array(MultiAgentRunsListAgent),
});
export type MultiAgentRunsListItem = z.infer<typeof MultiAgentRunsListItem>;

/** Response of GET /multi-agent/runs — newest first; next_cursor null when no older run exists. */
export const MultiAgentRunsPage = z.object({
  items: z.array(MultiAgentRunsListItem),
  next_cursor: z.string().nullable(),
});
export type MultiAgentRunsPage = z.infer<typeof MultiAgentRunsPage>;
```

### 3.2 HTTP
`GET /multi-agent/runs?cursor=<opaque>&limit=<1..50, default 20>` → `200 MultiAgentRunsPage`.
- `422` when `limit` is not an integer 1–50 (zod querystring) — UT-12.
- `422 validation_error` when `cursor` does not decode to a list position — UT-11.
- Workspace from `getContext`; the cursor never widens scope — UT-13. No route-specific rate limit (read-only, 0 LLM calls).

### 3.3 Server internal (U1-owned, fixed for review)
```ts
// reviews/types.ts
export const MultiAgentRunsQuery = z.object({
  cursor: z.string().min(1).max(256).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// reviews/domain/runs-cursor.ts (pure)
export interface RunsCursor { ranAt: string /* UTC, µs: 2026-10-12T08:00:00.123456Z */; id: string /* uuid */ }
export function encodeRunsCursor(c: RunsCursor): string;          // base64url(JSON {t, id})
export function decodeRunsCursor(raw: string): RunsCursor | null; // null on any malformed input; never throws

// reviews/domain/run-overall-state.ts (pure)
export function deriveOverallState(statuses: AgentRunStatus[]): { state: MultiAgentOverallState; failedCount: number };

// reviews/ports.ts (plain interfaces; added to MultiAgentRepositoryPort)
export interface MultiRunListRecord { id: string; prId: string; prNumber: number; prTitle: string; repoName: string; ranAt: Date; ranAtCursor: string }
export interface MultiRunAgentRecord { multiRunId: string; agentName: string | null; status: string | null; finishedAt: Date | null; costUsd: number | null }
listRunsPage(workspaceId: string, after: RunsCursor | null, take: number): Promise<MultiRunListRecord[]>;
agentRunsOf(multiRunIds: string[]): Promise<MultiRunAgentRecord[]>; // ordered by agent_runs.ran_at, id

// MultiAgentService
list(workspaceId: string, cursor: string | undefined, limit: number): Promise<MultiAgentRunsPage>;
```

### 3.4 Client
```ts
// client/src/lib/hooks/multi-agent.ts — query key ["multi-agent-runs"]
export function useMultiAgentRunsList(): UseInfiniteQueryResult<InfiniteData<MultiAgentRunsPage>>;
```
i18n — `client/messages/en/multiAgent.json`, new block `list` (U2 writes it): `configureRun` "Configure run" · `emptyTitle` "No multi-agent runs yet" · `emptyCta` "Configure run" · `errorTitle` "Couldn't load multi-agent runs" · `retry` "Retry" · `loadMore` "Load more" · `loadMoreError` "Couldn't load more runs" · `moreAgents` "+{count} more" · `state.running` "running" · `state.done` "done" · `state.failed` "{count} failed" · `rowLabel` "#{number} {title} · {repo} · {state}" · column headers `col.pr`, `col.repo`, `col.started`, `col.agents`, `col.time`, `col.cost`, `col.state`. Existing keys reused: `title`, `crumbGlobal`, `results.status.*`, `results.unpriced`, `results.unknownAgent` is NOT needed (the API sends the name).

## 4. Work units

### U0 — Foundation (main session; not an implementer unit)
| Field | Value |
|---|---|
| Kind | orchestrator |
| Wave | 0 |
| Depends on | none |
| Owns (create/modify) | `server/src/vendor/shared/contracts/observability.ts`, `client/src/vendor/shared/contracts/observability.ts`, `client/src/app/multi-agent/_components/MultiAgentEntry/**` (git mv → `client/src/app/multi-agent/_components/MultiAgentRunsList/**`), `client/src/app/multi-agent/page.tsx` (import path only) |
| Must not touch | any other vendored contract block; migrations; schema |
| Consumes | — |
| Produces | §3.1; folder `client/src/app/multi-agent/_components/MultiAgentRunsList/` (files `MultiAgentRunsList.tsx`, `styles.ts`, `index.ts`) |
| Checks | `cd server && pnpm typecheck` · `cd client && pnpm typecheck` |

**Steps**
1. Insert §3.1 identically into both `observability.ts` copies (only that block).
2. `git mv client/src/app/multi-agent/_components/MultiAgentEntry client/src/app/multi-agent/_components/MultiAgentRunsList`, then `git mv …/MultiAgentRunsList/MultiAgentEntry.tsx …/MultiAgentRunsList/MultiAgentRunsList.tsx`. Fix only the path in `index.ts` (`./MultiAgentRunsList`) and in `page.tsx` (`./_components/MultiAgentRunsList`), so that Wave 0 typechecks. The component keeps its old name and body until U2.
3. Commit Wave 0.

**Acceptance criteria**
- [ ] The §3.1 blocks in the two copies are byte-identical; both typechecks are clean; `git status` shows the folder as renames (`R`).

### U1 — Backend: `GET /multi-agent/runs`
| Field | Value |
|---|---|
| Kind | backend |
| Wave | 1 |
| Depends on | U0 |
| Owns (create/modify) | `server/src/modules/reviews/routes.ts`, `server/src/modules/reviews/multi-agent-service.ts`, `server/src/modules/reviews/ports.ts`, `server/src/modules/reviews/types.ts`, `server/src/modules/reviews/repository/multi-agent.repo.ts`, `server/src/modules/reviews/domain/runs-cursor.ts` (new), `server/src/modules/reviews/domain/run-overall-state.ts` (new) |
| Must not touch | `server/src/vendor/**`, `server/src/db/**` (no migration), `platform/container.ts`, `modules/index.ts`, `domain/multi-agent-totals.ts` (consume only), `run-executor.ts`, `service.ts`, existing routes' behaviour, `reviewer-core/**`; no new test files (user decision) |
| Consumes | §3.1, §3.3, `computeTotals`, `toRunStatus`, `ValidationError` (`server/src/platform/errors.ts:25`) |
| Produces | §3.2 endpoint |
| Checks | `node scripts/agent-check.mjs server <owned files>` · `cd server && pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known` |

**Steps**
1. **Domain:** `runs-cursor.ts` per §3.3 and Decision 2. Decode = base64url → `JSON.parse` in try/catch → shape check (`t` matches `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$` and parses to a finite date; `id` is a uuid), otherwise `null`. `run-overall-state.ts`: `running` if any is `running`; else `done` if every one is `done` (an empty set is `done`, EC-16); else `failed`. `failedCount` = failed + cancelled.
2. **Ports:** add §3.3 interfaces and the two methods (plain types, no ORM import).
3. **Repository:** `listRunsPage` = query (a) of Decision 3. It selects `ranAtCursor` via `to_char`, and the keyset predicate is bound through Drizzle `sql` placeholders (`${after.ranAt}::timestamptz`, `${after.id}::uuid`), never `sql.raw`. `agentRunsOf` = query (b), returning `[]` without a query for an empty id list. No `findings` or `reviews` access.
4. **Service `list`:** decode the cursor (malformed → `throw new ValidationError('Invalid cursor')`) → `listRunsPage(ws, after, limit + 1)` → `agentRunsOf(ids of the first limit)` → group by run in returned order. Per item: agents = `{ agent_name: name ?? UNKNOWN_AGENT_NAME, status: toRunStatus(s) }`; state via `deriveOverallState`; totals via `computeTotals({ createdAt: ranAt, now, runs })`; `agent_count` = agents.length. `next_cursor` = `encodeRunsCursor` of the last returned item when more than `limit` rows came back, else null.
5. **Route:** `app.get('/multi-agent/runs', { schema: { querystring: MultiAgentRunsQuery } }, …)`: `getContext` → `multiAgent.list(workspaceId, req.query.cursor, req.query.limit)`. Thin; place it next to `/multi-agent/latest`. Update the module doc comment.

**Acceptance criteria** (verified by code inspection + existing suites; no new tests)
- [ ] Page order `ran_at DESC, id DESC`, at most `limit` items (default 20), keyset cursor, `next_cursor` null when nothing older — SPEC-07 AC-76, EC-20.
- [ ] Each item carries every §3.1 field; agents in `ran_at, id` order — AC-77.
- [ ] Totals come from `computeTotals` with the same inputs as `read()` (`multi-agent-service.ts:119-123`), so they equal `GET /pulls/:id/multi-agent` for terminal runs — AC-78.
- [ ] `deriveOverallState`: {running, done} → running; {done, done} → done; {done, failed, cancelled} → failed, count 2 — AC-79.
- [ ] A run with no agent runs → `agent_count 0`, `done`, `0` ms, `null` cost — EC-16. A null agent name → "Unknown agent" — EC-17.
- [ ] Exactly 2 SQL statements per non-empty page (1 for an empty page), neither reading `findings`; no LLM/adapter port is reachable from `list` — NFR-12, NFR-13, NFR-14.
- [ ] `cursor=garbage` or a truncated cursor → 422 — UT-11. `limit` 0 / 51 / `abc` → 422 via zod; 50 accepted — UT-12.
- [ ] The workspace filter comes only from `getContext`; the cursor carries no workspace id; the keyset values are bound parameters — UT-13.
- [ ] depcruise clean, baseline not grown; `ports.ts` has no ORM or row import.

### U2 — UI: runs list page
| Field | Value |
|---|---|
| Kind | ui |
| Wave | 2 |
| Depends on | U0 (folder + contracts), U1 (endpoint, runtime) |
| Owns (create/modify) | `client/src/app/multi-agent/page.tsx`, `client/src/app/multi-agent/_components/MultiAgentRunsList/**` (incl. new `helpers.ts`, `constants.ts`, `_components/RunRow/**`), `client/src/lib/hooks/multi-agent.ts`, `client/messages/en/multiAgent.json` |
| Must not touch | `client/src/app/multi-agent/[prId]/**`, `client/src/app/multi-agent/configure/**`, `client/src/vendor/**`, `client/src/lib/multi-agent-urls.ts`, `client/src/components/app-shell/**`; no new test files (user decision) |
| Consumes | §3.1, §3.2, §3.4; `multiAgentResultsUrl`, `multiAgentConfigureUrl`, `formatCost`, `formatSeconds`, `relativeTime`, `@devdigest/ui` (`Button`, `EmptyState`, `ErrorState`, `Skeleton`) |
| Produces | `useMultiAgentRunsList`; `MultiAgentRunsList` component |
| Checks | `node scripts/agent-check.mjs client <owned files, explicit paths>` (client INSIGHTS 2026-10-07: pass files, not bracketed dirs) |

**Steps**
1. **Hook:** add `useMultiAgentRunsList` (`useInfiniteQuery`, key `["multi-agent-runs"]`, `initialPageParam: null`, URL `/multi-agent/runs` plus `?cursor=` (encoded) when set, `getNextPageParam: p => p.next_cursor ?? undefined`). `refetchInterval` = 4000 while any loaded item is `running`, else `false`. Remove `useLatestMultiAgentRun`. In `useStartMultiAgentRun.onSuccess`, replace the `["multi-agent-latest","workspace"]` invalidation with `["multi-agent-runs"]`. Type-only shared imports.
2. **Messages:** add the `list` block of §3.4; do not change existing keys.
3. **`MultiAgentRunsList`** (container, `'use client'`): `<AppShell crumb=[{label: crumbGlobal}, {label: title}]>`; heading plus a "Configure run" `Link`/button to `multiAgentConfigureUrl()` (no PR). It is always rendered and enabled, including in the error state. No `router.replace`/`push` anywhere.
   - States: loading skeleton; `!data && isError` → `ErrorState` + Retry (`refetch`); 0 items → `EmptyState` "No multi-agent runs yet" + Configure run; else rows.
   - "Load more" only when `hasNextPage`; a failed next page keeps the rows and shows an inline error + Retry (`fetchNextPage`).
   - `helpers.ts`: cost label (`unpriced_count > 0` → `results.unpriced` with `formatCost(total ?? 0)`, else `formatCost(total)`), visible agents (first 5) + overflow count, state label.
4. **`RunRow`:** the whole row is one Next `Link` to `multiAgentResultsUrl(pr_id, id)`, same tab. `aria-label` = `list.rowLabel` (number, title, repo, state). Cells:
   - "#N title" truncated with ellipsis and `title={pr_title}`;
   - repo; `relativeTime(ran_at)`; first 5 agents with a text status each, then "+K more"; `formatSeconds(total_duration_ms)`; cost label; state text.
   - All text is rendered as React text (no `dangerouslySetInnerHTML`). Styles in `styles.ts` (spread entries typed per client INSIGHTS 2026-09-23).
5. `page.tsx`: render `MultiAgentRunsList` (thin) and update its comment.

**Acceptance criteria** (verified by code inspection + existing suites; no new tests)
- [ ] `/multi-agent` renders the list with its heading. No `router.replace`/`push` in `MultiAgentRunsList/**` or `page.tsx` — SPEC-07 AC-75, EC-22 (manual Back check in §7).
- [ ] A row shows "#N title", repo, start time, agents with text status, total time, total cost, overall state — AC-80. More than 5 agents → 5 + "+K more" (≤ 5 → no suffix) — AC-81. Unpriced → "$<sum> + <n> unpriced" via `formatCost`, 0 sum → "$0.00 + n unpriced" — AC-82.
- [ ] A row is a real link to `/multi-agent/<prId>?multiRunId=<id>`, same tab; its accessible name holds the PR number, title and state — AC-83, AC-84.
- [ ] Configure run → `/multi-agent/configure` with no PR parameter — AC-85. Empty page → empty state + action; ≥ 1 item → rows, no empty state — AC-86.
- [ ] Load more appends the next page below the existing rows; hidden while `next_cursor` is null — AC-87, AC-88.
- [ ] Polls every 4 s while any shown item is `running`; no polling otherwise — AC-89, EC-23. A successful start invalidates `["multi-agent-runs"]`, so the new run is the first row on the next view — AC-90.
- [ ] Crumbs "Global › Multi-Agent Review" on the list — AC-91. `ConfigureRun.tsx:32` and `MultiAgentResults.tsx:74` still link to `/multi-agent` (unchanged) — AC-92.
- [ ] First-page failure → error + Retry, Configure run still enabled — EC-18. Load-more failure → rows kept + inline error + Retry — EC-19. Long title → ellipsis + full title in `title` — EC-21.
- [ ] Rows, Load more, Retry and Configure run are native links/buttons (keyboard-operable) — NFR-15 (manual axe in §7). PR title, repo and agent names render as plain text — UT-14.
- [ ] `rg -n "useLatestMultiAgentRun|MultiAgentEntry" client/src` → 0; `rg -n "from \"@devdigest/shared\"" <owned files>` shows only `import type`.

## 5. Waves (execution order)
| Wave | Units | Runs | Why this order |
|---|---|---|---|
| 0 | U0 | sequential, main session | contracts in both vendored copies + the folder rename (implementers cannot move files) |
| 1 | U1 (backend) | sequential | the endpoint the list calls |
| 2 | U2 (ui) | sequential | consumes §3.1/§3.2 at runtime; user-chosen order backend → ui |

Ownership is disjoint across all units. `multiAgent.json` and `hooks/multi-agent.ts` have exactly one owner (U2); the vendored files have one (U0). U0 touches `page.tsx` for the import path only, and U2 owns it afterwards (single-agent, sequential).

## 6. Test plan
- **No new tests (user decision).** Each unit only fixes existing tests its change breaks (none are expected: no existing test covers multi-agent code, §1).
- Existing suites run per wave in `plan-verifier`: `node scripts/agent-check.mjs server --full --it` (run alone; check the skipped count, server INSIGHTS 2026-10-07) and `node scripts/agent-check.mjs client --full`; depcruise `--ignore-known`.
- **Spec "Verify by" → evidence used instead (code inspection):**
  - AC-76/EC-20: keyset predicate + `limit+1` in `listRunsPage`/`list`;
  - AC-77/AC-78: item mapping + shared `computeTotals`;
  - AC-79: `deriveOverallState` branches;
  - EC-16/EC-17: empty-set path + `UNKNOWN_AGENT_NAME`;
  - NFR-12/13/14: statement count in the repository, no `findings` reference, no LLM port in `MultiAgentDeps` use;
  - UT-11/12/13: decoder null path → `ValidationError`, zod querystring, `getContext` scope;
  - AC-75 – AC-91, EC-18/19/21/23, UT-14: component/hook code paths named in U2's criteria.
- **EARS shapes to inspect:** WHILE AC-86/88/89 and EC-21 (enter and leave the state: empty ↔ rows, cursor ↔ null, running ↔ not); IF EC-16/17/18/19, UT-11/12/13/14 (the failure branch exists and matches the stated response); WHERE AC-81/82 (on and off: > 5 vs ≤ 5 agents; unpriced vs none).
- **Manual (§7 Phase 5):** EC-22, NFR-15.
- **Traceability:** every AC-75 – AC-92, EC-16 – EC-23, NFR-12 – NFR-15 and UT-11 – UT-14 is cited by U1 or U2. G-8 = AC-75 + AC-83 + AC-87.
- e2e: none.

## 7. Verification and review pipeline (orchestrator)
1. After U1: `plan-verifier scope=U1` (NOT MET → `mode: fix` of U1). After U2: `plan-verifier scope=U2`.
2. After Wave 2:
   - full server suite (alone) + depcruise `--ignore-known`;
   - full client suite;
   - `git diff --stat main -- reviewer-core/ ci/ agent-runner/ mcp/ server/src/db/` is empty.
3. One `architecture-reviewer` pass over the whole diff, and one `security-reviewer` pass on the server files only (cursor decode, parameter binding, workspace scope). No separate bugs reviewer.
4. At most 1 fix round (fixes → owning unit), then `plan-verifier scope=all`.
5. **Phase 5 — manual (main session):**
   - `next dev`: open `/multi-agent` (catches value imports of `@devdigest/shared`), open a row, press Back → the list (EC-22);
   - `g m` shortcut → list;
   - keyboard walk-through + axe with 0 serious violations (NFR-15);
   - `curl ':3001/multi-agent/runs?limit=abc'` → 422, `?cursor=garbage` → 422.
6. `spec-creator implemented SPEC-07` (same PR) → `/pr-self-review`; accept DET-003 for the vendored edit with a reason.

## 8. Risks
- **Keyset precision:** if the cursor timestamp loses µs precision, rows repeat or vanish between pages. Mitigated by Decision 2; the security/architecture review must check `to_char … .US` and the `::timestamptz` binding.
- **Late-commit race (accepted):** a run whose transaction started before a page was served but committed after it has an older `ran_at` and may be missed by later pages until a refetch. This is negligible for a local single-user app; polling/refetch re-reads from page 1.
- **No automated tests:** regressions show up only in code review, existing suites and Phase 5. The no-tests decision also leaves SPEC-07's "Verify by" columns unexecuted (see §9 follow-up).
- **Vendored drift:** only the §3.1 block may change, identically in both copies; DET-003 needs an accept.
- **depcruise:** new domain files import only `@devdigest/shared` types; `ports.ts` stays ORM-free.
- **Security:** user input reaches SQL only through the cursor → bound parameters after strict decode; rendered names are React text. Grounding and `INJECTION_GUARD` are untouched.
- **Folder rename** in Wave 0 must keep the typecheck green (path-only edits); U2 then rewrites the component body.

## 9. Out of scope
- Everything else in SPEC-07 (done). Deferred items stay deferred (AC-57, AC-64 – AC-66, AC-71).
- Removing `GET /multi-agent/latest` (kept by spec Compatibility).
- Promoting the unpriced-cost formatter shared with `ResultsHeader` (Decision 8).

### Spec follow-ups (owner: user / spec author)
1. The runs-list "Verify by" entries (unit / integration) were not executed as automated tests in this implementation, by user decision. Record this in the spec (or in the `implemented` note) so that the criteria are not read as test-backed.
2. Optional clarification: "repository name" in AC-77/AC-80 = `owner/name` (Decision 1).
