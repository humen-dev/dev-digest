# Multi-Agent Review — development plan

| Field | Value |
|---|---|
| Status | approved (2026-10-12 by user) |
| Goal | A reviewer runs a chosen set of agents concurrently on one PR (from the PR page or Configure run) and compares their results in Columns / Tabs with a "Where agents disagree" block, honest estimates and totals, live status and traces. |
| Requirements source | [`specs/2026-10-12-multi-agent-review.md`](../../specs/2026-10-12-multi-agent-review.md) — SPEC-07, approved (input; never edited here) |
| Execution mode | multi-agent (parallel waves), chosen by the user; capped at 3 implementer units (user decision 2026-10-12) |
| Packages touched | server · client · shared (vendored, both copies) |

## 1. Context
Today (evidence in the spec "Problem" section, re-verified):
- The batch runs agents sequentially: `for … await this.runOneAgent` (`server/src/modules/reviews/run-executor.ts:121-148`). Per-agent failure isolation already lives inside `runOneAgent` (`:356-381`).
- `multi_agent_runs` is a stub (`server/src/db/schema/runs.ts:43-52`). `agent_runs` has no link to it and no terminal timestamp (`:8-33`). Cancel/reap write no time (`server/src/modules/reviews/repository/run.repo.ts:94-112`).
- Contracts `MultiAgentRun`, `AgentColumn`, `Conflict` exist but are too thin (`server/src/vendor/shared/contracts/observability.ts:23-86`). No route implements them (`server/src/modules/reviews/routes.ts:10-17`). The reviews module has no `ports.ts`, and its service/executor take the whole `Container` (`service.ts:33`, `run-executor.ts:46`) — known drift, not refactored here.
- The PR page uses `RunReviewDropdown` (`client/src/app/repos/[repoId]/pulls/[number]/_components/RunReviewDropdown/RunReviewDropdown.tsx:54-82`), mounted in `PrDetailHeader.tsx:96-101`. `RunTraceDrawer`, `FindingCard` and `EvalCaseAction` are route-local (`page.tsx:17`, `FindingCard.tsx:24`).
- The sidebar has no Multi-Agent item (`client/src/vendor/ui/nav.ts:21-45`). `activeKeyFor` already maps `/multi-agent` (`client/src/components/app-shell/helpers.ts:28`).
- Grounding drops are already logged one line each (`reviewer-core/src/review/run.ts:239-240`). AC-60 needs only a test.

INSIGHTS relied on:
- server 2026-09-27: trace before status.
- server 2026-09-22/27: ports must not import rows or adapters.
- server 2026-10-07: per-route rate limit; `.it` suites skip silently; timing ITs are flaky in parallel.
- server DET-006: build secret-shaped fixtures at runtime.
- client 2026-09-23: vendored drift.
- client 2026-09-27: type-only imports from `@devdigest/shared`.
- client 2026-09-29: gate error states on `!data`; use `fireEvent` (no user-event).
- client 2026-10-07: pass explicit file paths to `agent-check` under `[segment]` dirs; assert polling via `getQueryData`.
- client 2026-09-19: no popover primitive.

### Requirements review
Approved-spec fast path (feasibility and testability only). Findings and resolution:
1. Column findings lack `end_line`, `rationale`, `suggestion`, `confidence` and triage state, and takes lack run status. Needed by AC-40/47/48/49/53 → extended additively in §3; Compatibility text → §9.
2. AC-61 needs a terminal time → `agent_runs.finished_at` (migration 0020).
3. UT-8 provider-key shapes (`sk-…`) are missing from `_shared/secrets.ts:14-22` → user chose local patterns in the column mapping (Decision 4).
4. AC-2 "per workspace": the client has no workspace id (local-first, one workspace) → one validated localStorage key (Decision 7).
5. Timing-sensitive checks → verification methods changed by user decision 2026-10-12 (Decision 12):
   - NFR-1, NFR-2, NFR-8: manual checks;
   - AC-61: deterministic tests;
   - AC-24: event ordering;
   - VP-1: manual, by the main session at the end.

Recommendations (all **accepted** by the user):
- R1: contracts in Wave 0, identical in both copies, `RunRequest` untouched.
- R2: migration `0020_multi_agent_review.sql`. Narrowed by deferral to `multi_run_id` + `finished_at` + indexes; no `prework_*`.
- R3: onion layout `reviews/domain` + `reviews/ports.ts` + `repository/multi-agent.repo.ts` + `multi-agent-service.ts`; one grouped aggregate for estimates.
- R4: new i18n namespace `multiAgent.json`.

Spec open questions Q-1..Q-3: the user confirmed the defaults. Full-file ranges group as is, triage is ignored for grouping, and the trace shape is unchanged.

**Deferred by user decision 2026-10-12** (not implemented here; cited as deferred in §6, not orphans):

| Requirement | What is skipped | Follow-up note |
|---|---|---|
| AC-64, AC-65, AC-66 | The shared pre-work cost item: no `prework_*` columns and no intent-cost plumbing; `MultiAgentRun` has no `shared_prework` | Later: a new migration with `prework_*` and an executor `onPrework` hook. Source: `EnsureIntentResult.status` + `record.tokens_*/api_cost_usd`, `intent/ports.ts:85-90` |
| AC-57 | Clicking a disagreement take does nothing | Later: an optional `finding_id` on `ConflictTake` + a callback |
| AC-71 | No PR-page link to the latest multi-agent results | Later: a header link using `GET /pulls/:id/multi-agent/latest`, which this plan already ships for AC-15 |

### Decisions
1. **Global routes** (user Q1=a): `/multi-agent` (sidebar entry → latest results or Configure run), `/multi-agent/configure?prId=&agents=`, `/multi-agent/[prId]?multiRunId=`. Sidebar: a new `GLOBAL` section after `SKILLS LAB` with "Multi-Agent Review", icon `Users` (design `Dev_Digest_Design/chrome.jsx:15-17`).
2. **Promote** `FindingCard` (+ `EvalCaseAction`) and `RunTraceDrawer` to `client/src/components/review/` (user Q4=a). `FindingCard` gets `showComingSoonActions?: boolean` (Learn / Reply disabled, Tabs only) and `badge?: ReactNode` (the "+N agents" chip). The PR page passes neither, so its action set is unchanged.
3. **New endpoints** live in the `reviews` module, which owns `agent_runs` and `multi_agent_runs` (onion rule 8). The new service takes narrow ports (`reviews/ports.ts`). It is wired in `reviews/routes.ts`, like `ReviewService` (`routes.ts:22`): `container.ts` cannot import reviews runtime (server INSIGHTS 2026-09-27).
4. **UT-8**: `redactSecretValues` (`_shared/secrets.ts:35`) plus local `sk-` / `sk-or-v1-` / `sk-ant-` patterns in `reviews/domain/column-error.ts`. `_shared/secrets.ts` is unchanged (user Q3=a).
5. **AC-30 simplified** (user decision): plain check-then-insert, no lock and no transaction. If an agent run of the PR with a non-null `multi_run_id` is `running` → 409 with its `multi_run_id`. The race of two near-simultaneous clicks is an **accepted risk** (local-first, single user).
6. **Groups are computed on read** by a pure domain function and never stored. The group id is `${file}#${line}`. `conflicts` carries every match group plus `is_conflict`; the client filters.
7. **Remembered selection** (AC-2 / UT-10 / EC-13, kept): localStorage key `devdigest.multiAgent.lastSelection` (JSON string array), validated on read, written on a successful start.
8. **Estimate fields are optional** on `Agent` (only `GET /agents` fills them), to avoid the contract cascade seen in the L07 retro.
9. **Cost format** (user decision 2026-10-12): use the existing `formatCost` (`client/src/lib/format-cost.ts:12`) everywhere. A total of 0.10 renders as "$0.100", not the spec example's "$0.10". Tests assert `formatCost` output. Spec alignment → §9.
10. **AC-24 is verified by event ordering** (user decision): with a blocked stub LLM, every agent's review starts before any completes. No wall-clock timers.
11. **Columns/Tabs** is local view state (no request, AC-33). `multiRunId` is always in the URL (AC-69).
12. **Verification methods** (user decision 2026-10-12):
    - NFR-1, NFR-2 (p95 latency) and NFR-8 (keyboard + axe): manual check in §7; no automated perf/load tests.
    - AC-61: deterministic `computeTotals` unit test + an integration test with stored `ran_at` / `finished_at` timestamps; no stub delays and no wall-clock thresholds.
    - VP-1: done manually by the main session in Phase 5 and recorded in the implementation PR description; not a plan-verifier item.

### Open questions
none

## 2. Affected modules
| Package | Touched? | Why / what changes | Architecture rule that applies |
|---|---|---|---|
| server | yes | concurrent executor + `finished_at`; estimates on `GET /agents`; multi-run domain, repository, service, 4 routes; migration 0020 | onion: domain (1), service + ports (2), repository (3), routes (4); depcruise baseline must not grow |
| client | yes | sidebar item; PR picker; Configure run; results page; promoted shared components; hooks + lib helpers; `multiAgent.json` | frontend-ui-architecture: thin pages, route `_components`, `src/components/review/` for 2+ routes, data via `src/lib/hooks` |
| reviewer-core | no | grounding gate and `INJECTION_GUARD` untouched | — |
| e2e | no | spec Non-goal | — |
| shared (vendored) | yes | `observability.ts` + `knowledge.ts`, identical in both copies, Wave 0 only | DET-003 accept with reason |

## 3. Contracts

### 3.1 Vendored Zod (both copies, identical) — `contracts/observability.ts`
```ts
import { FindingRecord, ReviewRunTarget } from './review-api.js';

export const MultiAgentRunRequest = z.object({
  agentIds: z.array(z.string().uuid()).min(1).max(50), // [] → 422 (AC-29), 51 → 422 (UT-9)
});
export const MultiAgentRunTriggerResult = z.object({
  id: z.string(), pr_id: z.string(), targets: z.array(ReviewRunTarget),
});
/** Replaces the old subset shape: full persisted finding + its match group. */
export const AgentColumnFinding = FindingRecord.extend({ group_id: z.string() });
export const AgentRunStatus = z.enum(['running', 'done', 'failed', 'cancelled']);
export const AgentColumn = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),          // null when the agent was deleted (EC-4)
  agent_name: z.string(),                   // "Unknown agent" when deleted (EC-4)
  agent_description: z.string(),            // '' when deleted
  provider: z.string().nullable(), model: z.string().nullable(),
  status: AgentRunStatus,
  error: z.string().nullable(),             // masked (UT-8)
  verdict: z.string().nullable(), score: z.number().int().nullable(), summary: z.string().nullable(),
  duration_ms: z.number().int().nullable(), cost_usd: z.number().nullable(),
  findings: z.array(AgentColumnFinding),
});
export const ConflictTake = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  persona: z.string(),                                 // agent name
  verdict: z.union([Severity, z.literal('ignored')]),  // highest severity, or 'ignored' = did not flag
  run_status: AgentRunStatus,                          // !== 'done' → client shows the status (AC-53)
  note: z.string(),                                    // finding title (AC-51) | agent description (AC-52) | ''
});
/** A match group (every group — the client filters on is_conflict). */
export const Conflict = z.object({
  id: z.string(),                             // `${file}#${line}`
  file: z.string(), line: z.number().int(), title: z.string(),
  is_conflict: z.boolean(),
  finding_ids: z.array(z.string()),
  takes: z.array(ConflictTake),               // one per agent run, column order
});
export const MultiAgentRun = z.object({
  id: z.string(), pr_id: z.string(), pr_number: z.number().int().nullish(), pr_title: z.string().nullish(),
  ran_at: z.string(),
  agent_count: z.number().int(),
  total_duration_ms: z.number().int(),        // ran_at → max(finished_at); while running: now − ran_at
  total_cost_usd: z.number().nullable(),      // sum of known cost_usd; null when none known
  unpriced_count: z.number().int(),           // agent runs with cost_usd null
  columns: z.array(AgentColumn),              // ordered by agent_runs.ran_at, id
  conflicts: z.array(Conflict),               // ordered by file, then line (NFR-5)
});
export const MultiAgentRunRef = z.object({ id: z.string(), pr_id: z.string(), pr_number: z.number().int() });
```
Update the `Conflict` doc comment (`observability.ts:61-64`) to say it carries every match group. Export the types via `z.infer`.

### 3.2 `contracts/knowledge.ts` — `Agent` (additive)
```ts
est_duration_ms: z.number().int().nullable().optional(), // mean duration_ms of done runs
est_cost_usd: z.number().nullable().optional(),          // mean cost_usd of done runs with known cost
has_history: z.boolean().optional(),                     // ≥ 1 done run
```

### 3.3 HTTP
| Method · path | Request | 200 | Errors |
|---|---|---|---|
| `GET /agents` | — | `Agent[]` with the 3 estimate fields set | — |
| `POST /pulls/:id/multi-agent-run` | body `MultiAgentRunRequest`; `config.rateLimit {max:10, timeWindow:'1 minute'}` | `MultiAgentRunTriggerResult` | 404 `not_found` (PR, or any unknown/foreign agent id; nothing created) · 409 `multi_run_in_flight`, `details: { multi_run_id }` · 422 · 429 |
| `GET /pulls/:id/multi-agent` | query `{ multiRunId?: uuid }` | `MultiAgentRun` | 404 `not_found` (no run for the PR, or id not of this PR + workspace) |
| `GET /pulls/:id/multi-agent/latest` | — | `MultiAgentRunRef \| null` | 404 PR not found |
| `GET /multi-agent/latest` | — | `MultiAgentRunRef \| null` (workspace) | — |

### 3.4 DB — `0020_multi_agent_review.sql` (`pnpm db:generate --name multi_agent_review`)
```
agent_runs.multi_run_id  uuid NULL REFERENCES multi_agent_runs(id) ON DELETE SET NULL
agent_runs.finished_at   timestamptz NULL     -- set on every terminal transition
INDEX agent_runs (multi_run_id)
INDEX multi_agent_runs (workspace_id, ran_at DESC)
INDEX multi_agent_runs (pr_id, ran_at DESC)
```
Drizzle: `multiRunId`, `finishedAt` on `agentRuns` (`runs.ts`).

### 3.5 Server internal signatures (U1-internal, fixed for review)
```ts
// reviews/domain/match-groups.ts — pure, no I/O, no LLM
export interface GroupInputRun { runId: string; agentId: string | null; agentName: string; agentDescription: string;
  status: AgentRunStatus; findings: Array<{ id: string; severity: Severity; title: string; file: string; startLine: number; endLine: number }>; }
export function buildMatchGroups(runs: GroupInputRun[]): Conflict[];
// reviews/domain/multi-agent-totals.ts
export function computeTotals(i: { createdAt: Date; now: Date;
  runs: Array<{ status: AgentRunStatus; finishedAt: Date | null; costUsd: number | null }> }):
  { totalDurationMs: number; totalCostUsd: number | null; unpricedCount: number };
// reviews/domain/column-error.ts
export function maskColumnError(text: string | null): string | null;
```

### 3.6 Client shared modules (produced by U2, consumed by U3)
```ts
// src/lib/hooks/multi-agent.ts
useStartMultiAgentRun()            // POST {agentIds}; onSuccess rememberSelection(agentIds)
useMultiAgentRun(prId: string | null, multiRunId: string | null) // key ['multi-agent-run', prId, multiRunId]; refetchInterval 4000 while any column 'running'
useLatestMultiAgentRunForPr(prId: string | null)                 // key ['multi-agent-latest', prId]
useLatestMultiAgentRun()                                         // key ['multi-agent-latest', 'workspace']
// src/lib/multi-agent-selection.ts — pure
summariseEstimate(agents: Agent[], selected: string[]): { maxDurationMs: number | null; costUsd: number | null }
formatSeconds(ms: number): string                                 // 8200 → "8.2s"
readRememberedSelection(): string[]; rememberSelection(ids: string[]): void
preselect(enabled: Agent[], remembered: string[]): string[]      // remembered ∩ enabled, else all enabled
// src/lib/multi-agent-urls.ts — pure
multiAgentResultsUrl(prId: string, multiRunId?: string): string  // /multi-agent/<prId>?multiRunId=<id>
multiAgentConfigureUrl(o?: { prId?: string; agentIds?: string[] }): string // /multi-agent/configure?prId=&agents=a,b
```

### 3.7 i18n — `client/messages/en/multiAgent.json` (written whole by U2, incl. U3's keys)
- Top level: `title` "Multi-Agent Review" · `crumbConfigure` "Configure run".
- `picker`: `heading` "Pick agents to run" · `clear` "Clear" · `run` "Run multi-agent review ({count})" · `configure` "Configure agents…" · `noHistory` "no history" · `summary` "≈ {duration} · {cost} · parallel fan-out" · `mergedWarning`.
- `configure`: `heading` "Run a Multi-Agent Review" · `stepPr` "Pull request" · `selectPr` "Select a pull request…" · `stepAgents` "Agents to run" · `selectAll` "Select all" · `clearAll` "Clear all" · `pickPrTitle` "Pick a pull request first" · `pickPrBody` · `noAgentsTitle` "Enable agents to run reviews" · `noAgentsCta` "Go to Agents" · `viewLatest` "View latest results" · `inFlight` "A multi-agent run is already in flight" · `inFlightLink` "Open it".
- `results`: `configureRun` "Configure run" · `selected` "{count} selected agents · parallel" · `meta` "{count} agents · parallel fan-out · {duration} total · {cost}" · `unpriced` "{cost} + {count} unpriced" · `cancelAll` "Cancel all" · `columns` · `tabs` · `viewTrace` "View trace" · `findingsCount` (plural) · `noFindings` "No findings." · `scoreLegend` "Score 0–100 · higher is better" · `status.{running,done,failed,cancelled}` · `statusAnnounce` "{agent}: {status}" · `sharedFailure` "Shared pre-work failed: {reason}" · `noResults` "No results" · `noRunTitle` "No multi-agent run yet" · `noRunCta` "Configure run" · `notFound` · `unknownAgent` "Unknown agent" · `chip` "+{count} agents".
- `finding`: `learn` "Learn" · `reply` "Reply to author" · `comingSoon` "Coming soon".
- `conflicts`: `heading` "Where agents disagree" · `onlyConflicts` "Show only conflicts" · `didNotFlag` "did not flag" · `needTwo` "Comparing agents needs at least two successful runs" · `noConflicts` "No conflicts — the agents agree on every flagged location."

## 4. Work units

### U0 — Foundation (main session; not an implementer unit)
| Field | Value |
|---|---|
| Kind | orchestrator |
| Wave | 0 |
| Depends on | none |
| Owns (create/modify) | `server/src/vendor/shared/contracts/observability.ts`, `server/src/vendor/shared/contracts/knowledge.ts`, `client/src/vendor/shared/contracts/observability.ts`, `client/src/vendor/shared/contracts/knowledge.ts`, `server/src/db/schema/runs.ts`, `server/src/db/migrations/0020_multi_agent_review.sql`, `server/src/db/migrations/meta/*` |
| Must not touch | any other migration |
| Consumes | — |
| Produces | §3.1, §3.2, §3.4 |
| Checks | `cd server && pnpm typecheck` · `pnpm db:migrate` on a throw-away DB (server INSIGHTS 2026-09-27) · `cd client && pnpm typecheck` |

**Steps**
1. Write §3.1/§3.2 identically into both copies; fix any compile cascade.
2. Edit `runs.ts` per §3.4 and generate `0020_*`. First check that no other worktree took 0020 (the dev Postgres is shared).

**Acceptance criteria**
- [ ] Diffs of the two `observability.ts` and the two `knowledge.ts` copies show no change-block differences; both typechecks are clean; the migration applies on a fresh DB.

### U1 — Backend: concurrent batches, estimates, multi-run API
| Field | Value |
|---|---|
| Kind | backend |
| Wave | 1 |
| Depends on | U0 |
| Owns (create/modify) | `server/src/modules/reviews/run-executor.ts`, `server/src/modules/reviews/service.ts`, `server/src/modules/reviews/routes.ts`, `server/src/modules/reviews/multi-agent-service.ts`, `server/src/modules/reviews/ports.ts`, `server/src/modules/reviews/types.ts`, `server/src/modules/reviews/repository/run.repo.ts`, `server/src/modules/reviews/repository/multi-agent.repo.ts`, `server/src/modules/reviews/domain/match-groups.ts`, `server/src/modules/reviews/domain/multi-agent-totals.ts`, `server/src/modules/reviews/domain/column-error.ts`, `server/src/modules/agents/repository.ts`, `server/src/modules/agents/service.ts`, `server/test/multi-agent-domain.test.ts`, `server/test/reviews-concurrency.it.test.ts`, `server/test/agents-estimates.it.test.ts`, `server/test/multi-agent.it.test.ts` |
| Must not touch | `reviewer-core/**`, `_shared/secrets.ts` (import only), `container.ts`, `modules/index.ts`, `runOneAgent` prompt/grounding inputs, `reviews/repository.ts` facade signatures used by existing callers |
| Consumes | §3.1–§3.5 |
| Produces | §3.3 endpoints |
| Checks | `node scripts/agent-check.mjs server <owned files>` · `pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known` |

**Steps**
1. **Executor:**
   - replace the loop at `run-executor.ts:121-148` with `Promise.allSettled`;
   - keep per-agent logging and keep trace-before-status;
   - `completeAgentRun`, `cancelRunIfRunning` and `reapStaleRunningRuns` set `finishedAt: new Date()`.
2. **Estimates:** `AgentsRepository.runEstimates(workspaceId)`, ONE grouped read-only query over `agent_runs` (`status='done'`): `avg(duration_ms)`, `avg(cost_usd) FILTER (WHERE cost_usd IS NOT NULL)`, `count(*)`. `AgentsService.list` merges it in; no row → nulls + `has_history: false`.
3. **Domain (pure):**
   - `buildMatchGroups`: union-find over findings of `done` runs; same file string; inclusive overlap.
   - `line` = min start; `title` = top severity, ties broken by lowest start, then id.
   - One take per run: highest severity + title, or `'ignored'` + description; non-`done` → `run_status`, note `''`.
   - `is_conflict` = a participating `'ignored'` take or more than one distinct severity.
   - Sort by file, then line; no fs/LLM import.
   - `computeTotals` and `maskColumnError` per §3.1 comments and Decision 4.
4. **Ports + repository:**
   - `ports.ts` uses plain interfaces only (no ORM or row imports, server INSIGHTS 2026-09-22);
   - `MultiAgentRepository`: `findInFlight(prId)`, `createMultiRun(workspaceId, prId)`, `createLinkedRun(…)` (agent-run insert plus `multi_run_id`), run by id / latest for the PR (workspace-scoped), columns (runs ⟕ agents ⟕ reviews ⟕ findings), latest for the workspace.
5. **Service `MultiAgentService`** (narrow ports):
   - validate the PR; dedupe ids; resolve every agent in the workspace, any miss → `NotFoundError`, nothing created;
   - in-flight → `AppError('multi_run_in_flight', …, 409, { multi_run_id })` (Decision 5);
   - create the rows, then `batch.start` (fire-and-forget);
   - read: columns (masked error, "Unknown agent"), `group_id` per finding, groups, totals.
6. **Wiring:** `ReviewService.startBatch(workspaceId, prId, jobs, logger)` loads pull/repo/agents and fires `executeRuns`. `routes.ts` adds the 4 routes with zod params/query/body; POST uses `config.rateLimit {max:10, timeWindow:'1 minute'}`.

**Acceptance criteria**
- [ ] Blocked stub LLM, 3 agents: all three review calls start before any completes (event ordering, no timers) — AC-24.
- [ ] Stub throws (429-shaped) for agent B → A and C `done` with findings, B `failed` — AC-25, EC-9.
- [ ] Each run buffer holds the shared pre-work events plus only its own agent's events, one "Loading PR diff" step per buffer, and the diff is loaded once — AC-26, AC-27.
- [ ] An ungrounded stub finding → the trace log has `grounding dropped "<title>": <reason>` plus tokens, cost and grounding — AC-60.
- [ ] Reap → `failed` with `finished_at` set — EC-3. Existing `reviews.it.test.ts` passes unchanged — NFR-6.
- [ ] Estimates: done runs 8 s/$0.06, 6 s/$0.04, 7 s/null → 7000 ms / $0.05 (AC-16); only failed runs → nulls + `has_history: false` (AC-17); only unpriced done runs → duration present, cost null (AC-18). NFR-1 is manual (§7).
- [ ] Domain grouping:
  - 10–20 / 18–25 in one file → 1 group; the same ranges in two files → 2; an A~B~C chain → 1 — AC-46;
  - each group has file, min line, top title, one take per run and all finding ids — AC-45, AC-47;
  - take texts — AC-51, AC-52; a failed run → `run_status: 'failed'` — AC-53;
  - shuffled input gives identical output — NFR-5; a `../../etc/passwd` path groups by string with no fs import — UT-7; triage is ignored — EC-11; a full-file range groups as is — EC-10.
- [ ] Domain masking: runtime-built `ghp_…` and `sk-or-v1-…` fixtures are masked — UT-8.
- [ ] POST 3 ids (with one duplicate) → 1 multi-run + 3 linked agent runs; the response arrives while all are `running` — AC-22, AC-23.
- [ ] Valid + foreign id → 404 with 0 new rows — AC-28, UT-1. `[]` → 422 and 51 ids → 422 — AC-29, UT-9.
- [ ] A second POST while one is running → 409 with the first id — AC-30. 11 POSTs within a minute → 429 — NFR-7.
- [ ] GET without the param returns the newer of two runs, with the param the older — AC-32, EC-15. A foreign or other-PR id → 404 with no data — EC-6, UT-2. A deleted agent → "Unknown agent" + stored results — EC-4.
- [ ] AC-61, deterministic:
  - `computeTotals` unit test: created t0, terminal runs finished at t0+4.2 s and t0+3 s → 4200 ms, not the max of agent durations;
  - IT with stored `ran_at` / `finished_at` timestamps returns that wall-clock in `total_duration_ms`;
  - no stub delays.
- [ ] Costs 0.06/null/0.04 → 0.10 + 1 unpriced — AC-62.
- [ ] Reads make 0 LLM calls — NFR-3. A 3-agent run makes 3 review executions and ≤ 1 classifier call — NFR-4. NFR-2 is manual (§7).
- [ ] Per-agent prompts of a multi-run equal those of `POST /pulls/:id/review` — UT-6. A stored secret comes back masked in `error` — UT-8.

### U2 — UI: entry points (nav, hooks, PR picker, Configure run)
| Field | Value |
|---|---|
| Kind | ui |
| Wave | 1 |
| Depends on | U0 (U1 runtime only, via §3.3) |
| Owns (create/modify) | `client/src/vendor/ui/nav.ts`, `client/src/components/app-shell/helpers.test.ts`, `client/src/lib/hooks/multi-agent.ts`, `client/src/lib/hooks/multi-agent.test.ts`, `client/src/lib/hooks/index.ts`, `client/src/lib/multi-agent-selection.ts`, `client/src/lib/multi-agent-selection.test.ts`, `client/src/lib/multi-agent-urls.ts`, `client/src/lib/multi-agent-urls.test.ts`, `client/messages/en/multiAgent.json`, `client/messages/en/runs.json`, `client/src/app/repos/[repoId]/pulls/[number]/_components/AgentPicker/**`, `client/src/app/repos/[repoId]/pulls/[number]/_components/PrDetailHeader/PrDetailHeader.tsx`, `client/src/app/repos/[repoId]/pulls/[number]/_components/RunReviewDropdown/**` (delete), `client/src/app/multi-agent/page.tsx`, `client/src/app/multi-agent/_components/MultiAgentEntry/**`, `client/src/app/multi-agent/configure/page.tsx`, `client/src/app/multi-agent/configure/_components/ConfigureRun/**` |
| Must not touch | `pulls/[number]/page.tsx`, `FindingCard/**`, `RunTraceDrawer/**`, `client/src/app/multi-agent/[prId]/**`, `client/src/lib/hooks/reviews.ts` |
| Consumes | §3.1–§3.3, `useAgents`, `useActiveRepo`, `usePulls`, `usePullDetail` |
| Produces | §3.6 modules, §3.7 messages (complete, incl. results/conflicts/finding keys for U3) |
| Checks | `node scripts/agent-check.mjs client <owned files, explicit paths>` |

**Steps**
1. `nav.ts`: section `GLOBAL` after SKILLS LAB with `{ key: "multi-agent", label: "Multi-Agent Review", icon: "Users", href: "/multi-agent", gKey: "m" }`, plus SHORTCUTS "g m".
2. Write the §3.6 modules and all of §3.7. Reword `runs.json` `page.meta` / `page.subtitle` / `noRun.bodyReady` (no "p-queue", "worktrees" or "every enabled agent").
3. `AgentPicker`: hand-rolled popover (portal + `position: fixed`, client INSIGHTS 2026-09-19).
   - Contents: enabled agents with checkbox + estimate or "no history"; Clear; summary (`formatSeconds` + `formatCost`); run button; "Configure agents…" → `multiAgentConfigureUrl({prId})`; merged warning.
   - Run → start, then `router.push(multiAgentResultsUrl(prId, id))`. On error, show the message; a 409 links to `details.multi_run_id`.
   - Mount it in `PrDetailHeader` instead of `RunReviewDropdown`.
4. `MultiAgentEntry`: `useLatestMultiAgentRun`, then `router.replace` to the results URL, or to configure when null or on error.
5. `ConfigureRun`:
   - PR select from the active repo, preselected from `?prId`;
   - agent cards (name, description, estimate) preselected from `?agents` or `preselect`;
   - Select all / Clear all; summary; run;
   - empty states; "View latest results" via `useLatestMultiAgentRunForPr` (no auto-navigation).
   - Pages stay thin (`<AppShell crumb>` + view).

**Acceptance criteria**
- [ ] The nav has the GLOBAL `multi-agent` item; `activeKeyFor("/multi-agent/configure")` → `multi-agent` — AC-9.
- [ ] Lib: AC-19 example → max 8200 and cost 0.10; a null estimate is skipped; stale ids are dropped; garbage storage → all enabled — AC-19, AC-20, AC-2, EC-13, UT-10.
- [ ] Hook: polls every 4 s while a column is `running` and stops after (asserted via `getQueryData`) — AC-35, EC-8.
- [ ] Picker: 3 enabled + 1 disabled → 3 checkbox rows with estimates, no run-all item — AC-1. Label "(1)" / "(2)" enabled, 0 → disabled, Clear → 0 — AC-3, AC-4, AC-5.
- [ ] Picker: run → the POST body `agentIds` equals the checked set and the router gets the results URL — AC-6. Configure target carries `prId` — AC-7. Merged PR → warning, run enabled — AC-8. Summary renders `≈ 8.2s · ${formatCost(0.1)} · parallel fan-out` and "no history" — AC-19, AC-20.
- [ ] Configure: no PR → empty state + disabled run — AC-10. Cards with name, description, estimate — AC-11. Select all → "Clear all" — AC-12. Run → body + navigation — AC-13.
- [ ] Configure: no enabled agent → "Enable agents…" + Agents link — AC-14. A PR with a run → "View latest results" without navigation — AC-15. Only GET requests during the configure flow — AC-21. `?prId=X&agents=a,b` preselects both — AC-70 (target).
- [ ] Entry: latest → `replace` to its results URL; null → configure — AC-67, AC-68.
- [ ] Hostile agent names and descriptions render as text — UT-5. `rg -n "p-queue|worktrees" client/messages` → 0 — NFR-11. NFR-8 is manual (§7).

### U3 — UI: results page + component promotion
| Field | Value |
|---|---|
| Kind | ui |
| Wave | 2 |
| Depends on | U2 (hooks, URLs, messages), U1 (runtime) |
| Owns (create/modify) | `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/**` (move out), `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/**` (move out), `client/src/components/review/FindingCard/**`, `client/src/components/review/RunTraceDrawer/**`, `client/src/app/repos/[repoId]/pulls/[number]/page.tsx`, `client/src/app/repos/[repoId]/pulls/[number]/page.test.tsx`, `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx`, `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx`, `client/src/app/repos/[repoId]/pulls/[number]/_components/SeverityFilterBar/SeverityFilterBar.tsx`, `client/src/app/multi-agent/[prId]/page.tsx`, `client/src/app/multi-agent/[prId]/_components/MultiAgentResults/**`, `client/src/app/multi-agent/[prId]/_components/ResultsHeader/**`, `client/src/app/multi-agent/[prId]/_components/ColumnsView/**`, `client/src/app/multi-agent/[prId]/_components/TabsView/**`, `client/src/app/multi-agent/[prId]/_components/AgentsChip/**`, `client/src/app/multi-agent/[prId]/_components/ConflictsSection/**` |
| Must not touch | `client/messages/**` (keys come from U2; a missing key → `BLOCKED:`), `PrDetailHeader/**`, `AgentPicker/**`, `client/src/lib/**` |
| Consumes | §3.1, §3.6, §3.7, `usePullDetail`, `useCancelRun`, `useFindingAction` |
| Produces | `@/components/review/FindingCard` (`showComingSoonActions?`, `badge?`), `@/components/review/RunTraceDrawer` |
| Checks | `node scripts/agent-check.mjs client <owned files, explicit paths>` |

**Steps**
1. **Promotion:** move the folders (incl. nested `EvalCaseAction`) with their tests; cross-folder imports use `@/`; update the importers and the `page.test.tsx` mock path. `FindingCard` gets `showComingSoonActions` (Learn/Reply `disabled`, `title` = coming soon, no handler) and `badge`.
2. **`MultiAgentResults`** (container):
   - `useMultiAgentRun(prId, ?multiRunId)`; after a load without the param, `router.replace` adds `multiRunId`;
   - local `view`; `?trace` for the drawer (`running` = column status);
   - states: loading; 404 without param → "No multi-agent run yet" + configure link; 404 with param → not found;
   - error gated on `!data`;
   - `helpers.ts`: chip counts, shared-failure detection (all failed with the same error), participating count, status announcements.
3. **`ResultsHeader`:**
   - Configure run → `multiAgentConfigureUrl({prId, agentIds})`;
   - selected count; PR number + title; meta line (`formatSeconds`, `formatCost`, unpriced suffix);
   - Cancel all while any running (`useCancelRun` per running run);
   - polite live region; score legend.
4. **`ColumnsView`:** per run, name, status text, score ring, duration, cost, mini findings with `AgentsChip`, count, View trace, and error / cancelled / "No findings.". More than 5 columns → horizontal scroll with `minmax(220px,1fr)`.
5. **`TabsView`:** tabs (name + score); summary card; `FindingCard` list with `showComingSoonActions` and the chip as `badge`; Accept/Dismiss via `useFindingAction`.
6. **`ConflictsSection`** below both views:
   - "Show only conflicts" toggle, off initially;
   - takes show severity text, "did not flag" + note, or the run status;
   - fewer than 2 participating → needs-two message; toggle on with none → no-conflicts message.

**Acceptance criteria**
- [ ] `rg -n "pulls/\[number\]/_components/(FindingCard|RunTraceDrawer)" client/src` → 0. PR page tests pass and its card shows only Accept, Dismiss and Turn into eval case (Compatibility).
- [ ] Learn/Reply have `disabled` + "Coming soon" and send no fetch — AC-43. `<script>` titles and `javascript:` links render inert — UT-3.
- [ ] Header per AC-31 (no "worktrees"/"p-queue") — AC-31. Toggle → no extra fetch — AC-33. `?multiRunId=X` → the request names X — AC-69. Configure run carries the PR + agent ids — AC-70.
- [ ] Columns: every element present — AC-34. A status flip shows within one 4 s poll, including after an EventSource close — AC-35, EC-8. Running fixture shows per-agent status — EC-5.
- [ ] Columns states: failed column shows its error with siblings intact — AC-36; cancelled — AC-37; "No findings." — AC-38; one shared banner — EC-1; "No results" + reasons — EC-2; 6 agents → scroll container — EC-12; no run → empty state — EC-7.
- [ ] Tabs: second tab's summary card — AC-39. Expand → confidence, category, rationale, fix and the 5 actions — AC-40. Accept/Dismiss routes called — AC-41. Eval draft opens for that finding — AC-42. Legend in both modes — AC-44.
- [ ] "+1 agents" chip in both modes; opening it lists the originals (agent, severity, title, rationale) — AC-48, AC-49. Section present in both modes — AC-50.
- [ ] Conflicts: 1 unanimous + 2 conflicting → first render 3, on 2, off 3 — AC-54, AC-74. Take texts and statuses — AC-51, AC-52, AC-53. Needs-two message — AC-55, EC-14. No-conflicts message — AC-56.
- [ ] View trace mounts the drawer with that `run_id` — AC-58. A running run shows Live log — AC-59. 1 unpriced → `${formatCost(sum)} + 1 unpriced` — AC-63.
- [ ] Cancel all only while running; 2 running + 1 done → 2 cancel calls — AC-72, AC-73.
- [ ] Live region announces status flips — NFR-10. Status, severity and verdict text are present — NFR-9. Hostile summary, title or name renders as text — UT-4, UT-5. NFR-8 is manual (§7).

## 5. Waves (execution order)
| Wave | Units | Runs | Why this order |
|---|---|---|---|
| 0 | U0 | sequential, main session | contracts and migration underpin everything |
| 1 | U1 (backend), U2 (ui) | parallel | disjoint packages; U2 uses §3.3 only at runtime |
| 2 | U3 (ui) | sequential | consumes U2's hooks, URLs and messages (earlier wave); touches PR-page importers only after U2 is done |

No file is owned twice within a wave. `multiAgent.json` has exactly one owner (U2).

## 6. Test plan
- **server** (U1): `multi-agent-domain.test.ts`; `reviews-concurrency.it.test.ts`; `agents-estimates.it.test.ts`; `multi-agent.it.test.ts`; existing `reviews.it.test.ts` unchanged. Check the skipped count of `.it` runs. No perf/load tests and no wall-clock thresholds (AC-24 by ordering, AC-61 by stored timestamps).
- **client**:
  - U2: lib + hook tests, `helpers.test.ts`, `AgentPicker.test.tsx`, `ConfigureRun.test.tsx`, `MultiAgentEntry.test.tsx`;
  - U3: moved tests, `MultiAgentResults`, `ColumnsView`, `TabsView`, `ResultsHeader`, `ConflictsSection` tests.
  - `fireEvent`; messages imported from JSON.
- EARS shapes:
  - WHILE (AC-3/4, AC-35, AC-72, AC-74): enter and leave the state;
  - IF: inject the failure (stub throw, 404/409/422, malformed storage, hostile fixtures);
  - WHERE (AC-8, AC-38, AC-48, AC-54, AC-63): feature on and off.
- **Traceability:**
  - every spec AC / EC / NFR / UT is cited by U1–U3, except the items below;
  - **deferred:** AC-57, AC-64, AC-65, AC-66, AC-71 (§1);
  - **manual (§7):** NFR-1, NFR-2, NFR-8, VP-1.
- **e2e:** none (spec Non-goal).

## 7. Verification and review pipeline (orchestrator)
1. After each wave: `plan-verifier scope=U<n>` per unit (NOT MET → `mode: fix` of that unit).
2. After Wave 2:
   - `node scripts/agent-check.mjs server --full --it`, run alone;
   - depcruise `--ignore-known`;
   - `node scripts/agent-check.mjs client --full`;
   - `git diff --stat -- reviewer-core/ ci/ agent-runner/ mcp/` is empty.
3. One `architecture-reviewer` pass over the whole diff, and one `security-reviewer` pass on server files only. No separate bugs reviewer.
4. At most 1 fix round (fixes → owning unit), then re-review limited to the fix range.
5. `plan-verifier scope=all`.
6. **Phase 5 — manual checks by the main session** (not plan-verifier items):
   - `next dev` on `/multi-agent`, configure, results and the PR page (catches `@devdigest/shared` value imports);
   - NFR-1: `GET /agents` stays below 500 ms on the seeded DB plus extra runs (timed curl loop);
   - NFR-2: `GET /pulls/:id/multi-agent` stays below 1 s for a large run;
   - NFR-8: keyboard walk-through of the full flow + an axe check with 0 serious violations;
   - **VP-1**: the "1 vs 3" table on seeded PR #482 (Security vs Security + Performance + General). Record cold and warm runs separately, with wall-clock total, per-agent duration, tokens, cost or "unpriced", and cached-token fields where available. Report the measured ratio unadjusted and name its likely causes. Put the table in the implementation PR description.
7. `/pr-self-review`; accept DET-003 for the vendored edits with a reason.

## 8. Risks
- **Migration 0020 collision** on the shared dev Postgres with another worktree. Check before U0 commits.
- **Vendored drift**: both copies must match in the touched blocks. DET-003 needs an accept.
- **Concurrency side effects**: `POST /review` becomes concurrent too, and provider 429s may rise (R-2). Isolation is per agent; the NFR-6 suite guards.
- **Accepted race (Decision 5)**: two near-simultaneous POSTs can create two multi-runs. Accepted for a local-first, single-user app.
- **U1 is large** (executor + estimates + domain + API) and on the critical path. Domain-first ordering inside the unit keeps it testable step by step.
- **U3 promotion** can miss an importer → typecheck + `rg` guard. e2e strings are unchanged (drawer texts kept, `e2e/specs/15-*`).
- **depcruise**: `reviews/ports.ts` must not import rows or adapters. Do not add baseline entries.
- **Performance is checked manually only** (NFR-1, NFR-2), so a regression shows up only in Phase 5.
- **Security**: UT-8 masking and plain-text rendering (UT-3..5) are the only new untrusted-output paths. Grounding and `INJECTION_GUARD` are untouched.

## 9. Out of scope
- Spec Non-goals: Learn/Reply behaviour, history browser, stored groups, colour/icon schema, Agent Performance, MCP/e2e, concurrency caps.
- Deferred by user decision 2026-10-12: AC-57, AC-64, AC-65, AC-66, AC-71 (§1).

### Spec follow-ups (owner: user / spec author)
1. Compatibility section: list the additional additive contract changes — full finding fields + `group_id`; nullable `agent_id` + `agent_description` on columns; `run_id` / `run_status` on takes; `id` / `is_conflict` / `finding_ids` on groups; `pr_title`; `MultiAgentRunRef`; `agent_runs.finished_at`.
2. Mark AC-57, AC-64, AC-65, AC-66, AC-71 as deferred (and drop "shared pre-work item" from Data and state until then).
3. Verify-by updates:
   - AC-24: event ordering with a blocked stub;
   - AC-30: the race is accepted; sequential posts are tested;
   - AC-61: deterministic totals unit test + stored-timestamp IT;
   - NFR-1, NFR-2, NFR-8: manual.
4. AC-19 / AC-63 cost examples ("$0.10") → align with the repo's `formatCost` ("$0.100"), per the user decision (Decision 9).
