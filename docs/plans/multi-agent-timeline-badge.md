# Multi-Agent Review — timeline badge (SPEC-07 revision 2026-10-13) — development plan

| Field | Value |
|---|---|
| Status | approved (2026-10-13 by user: execution shape, mode, test policy and review pipeline pre-approved) |
| Goal | Each "Agent runs" timeline row on the PR page that belongs to a multi-agent run shows a "Multi-agent" badge that opens that row's own multi-agent results in one click. |
| Requirements source | [`specs/2026-10-12-multi-agent-review.md`](../../specs/2026-10-12-multi-agent-review.md) (SPEC-07, approved), **timeline-badge revision only**: AC-71 (redefined, variant b), AC-93 – AC-96, EC-24 – EC-27, NFR-16, NFR-17, UT-15, UT-16. The rest of SPEC-07 is done ([`multi-agent-review.md`](./multi-agent-review.md), [`multi-agent-runs-list.md`](./multi-agent-runs-list.md)). |
| Execution mode | single-agent (sequential pass) — chosen by the user |
| Packages touched | server · client · shared (vendored, both copies) |

## 1. Context
- `agent_runs.multi_run_id` exists (nullable FK → `multi_agent_runs`, `onDelete: 'set null'`, `server/src/db/schema/runs.ts:34`) and is indexed (`:38`). **No migration.**
- `RunSummary` has no multi-agent field (`server/src/vendor/shared/contracts/trace.ts:119-140`; the client copy is the same block at `client/src/vendor/shared/contracts/trace.ts:118-139`, already offset by one line — pre-existing drift, not to be "resynced").
- `GET /pulls/:id/runs` (`server/src/modules/reviews/routes.ts:148-151`, no response schema → no serializer stripping) → `ReviewService.listRuns` (`service.ts:71`) → `ReviewRepository.listRunsForPull` (`repository.ts:82-83`) → `run.repo.ts:40-69`. The query selects the whole `agent_runs` row (`run.repo.ts:46`), so `run.multiRunId` is already loaded; only the mapping lacks it. Workspace scope is at `run.repo.ts:49` (UT-16 already holds).
- Client: `usePrRuns` (`client/src/lib/hooks/reviews.ts:40-47`) → page (`pulls/[number]/page.tsx:48`) → `FindingsTab` (`page.tsx:159-164`, has `prId: string | null`, `FindingsTab.tsx:14`) → `RunHistory` (`FindingsTab.tsx:147-154`). `RunHistory` gets no `prId` today (`RunHistory.tsx:90-107`); the row is a plain `div` whose only interactive children are buttons (`RunHistory.tsx:159-257`). The outcome `Badge` is at `:160-162`. `RunHistory.tsx` is 263 lines already.
- URL builder `multiAgentResultsUrl(prId, multiRunId)` percent-encodes both parts (`client/src/lib/multi-agent-urls.ts:4-7`) → UT-15 holds by reuse. The sidebar uses icon `Users` for Multi-Agent Review (`client/src/vendor/ui/nav.ts:47`).
- MCP parses `GET /pulls/:id/runs` with a non-strict `ApiRunSchema` naming 9 fields (`mcp/src/api/schemas.ts:68-86`) → the extra field is stripped; `mcp/` unchanged.
- Fixtures that build a full `RunSummary`: only `RunHistory.test.tsx:16-36` (client). No server test or mock builds `RunSummary` or calls `/runs` (`rg "/runs['\`]|listRunsForPull" server/test` → 0). `page.test.tsx:46` mocks `usePrRuns` with `[]` (unaffected). No e2e flow mentions multi-agent (`rg -i multi-agent e2e/specs` → 0).
- INSIGHTS relied on: client 2026-09-27 (type-only `@devdigest/shared` imports), 2026-09-23 (vendored copies drift; edit only the touched block), 2026-10-07 (agent-check: pass explicit files under `[number]`), 2026-09-29 (`fireEvent`, no user-event — relevant only if a test is touched); server 2026-10-07 (check IT skipped count).

### Requirements review
Approved-spec fast path (feasibility + testability). Nothing blocking.
1. **Test policy (user decision):** no new tests. Every spec "Verify by" is checked by code inspection in `plan-verifier` plus the existing suites; mapping in §6. Units fix only existing tests their change breaks (the `RunHistory.test.tsx` fixture, see U0).
2. **AC-93 "existing `RunHistory.test.tsx` passes"** is directly executable and stays a hard check.
3. **NFR-17 / AC-95 modifier-click** are satisfied by construction with a native `<a href>` (Next `Link`); the manual keyboard walk-through is in §7.
4. **EC-24, EC-25** need no code: the FK `set null` and the absence of a backfill already yield null.

Recommendations: none.

### Decisions
1. **`RunHistory` gains an optional `prId?: string | null` prop**, passed by `FindingsTab`. The badge renders only when both `prId` and `run.multi_run_id` are non-null. Rejected: adding `pr_id` to `RunSummary` (more contract surface than the spec asks for).
2. **Badge = a nested child `RunHistory/_components/MultiAgentRunBadge/`** (Next `Link` wrapping the `@devdigest/ui` `Badge` with icon `Users`). This keeps `RunHistory.tsx` from growing past its current size (react-best-practices size rule; frontend-ui-architecture "child in nested `_components/`"). Rejected: inline JSX in `RunHistory.tsx`.
3. **Placement:** directly after the outcome `Badge` (`RunHistory.tsx:160-162`), so it reads with the visual language the spec cites. Rendered for every status, including `running` (EC-26).
4. **Accessible name** via `aria-label` = new key `prReview.timeline.multiAgentOpen` ("Multi-agent — open the multi-agent results"); visible text = `prReview.timeline.multiAgent` ("Multi-agent"); `title` = the same as the aria-label.
5. **Transient red typecheck between Wave 0 and U1 (server only):** the additive required field makes `run.repo.ts:51` fail to typecheck until U1 maps it. The client fixture line is done in U0 so the client stays green from Wave 0 on. Rejected: putting the server line into U0 (the user assigned AC-96 to U1).

### Open questions
none

## 2. Affected modules
| Package | Touched? | Why / what changes | Architecture rule that applies |
|---|---|---|---|
| server | yes | `run.repo.ts` maps `multiRunId` → `multi_run_id` | onion ring 3 (repository returns the contract); no route/service change |
| client | yes | badge child, `RunHistory` prop + render, `FindingsTab` passes `prId`, i18n | frontend-ui-architecture: nested `_components/`, strings via next-intl, URL via `src/lib/multi-agent-urls.ts` |
| reviewer-core | no | — | grounding gate / INJECTION_GUARD untouched |
| e2e | no | no flow touches the timeline badge | — |
| mcp | no | non-strict schema strips the field (`mcp/src/api/schemas.ts:68`) | — |
| shared (vendored) | yes | `RunSummary.multi_run_id`, both copies, identical | Wave 0 only (U0) |

`ci/`, `agent-runner/`, `reviewer-core/`, `mcp/` and `server/src/db/**` are untouched.

## 3. Contracts

### 3.1 Vendored Zod — `contracts/trace.ts`, `RunSummary` (both copies, identical; append after `cost_usd`)
```ts
  // SPEC-07 — the multi-agent run this agent run belongs to; null for single
  // runs, legacy rows, and when that multi-agent run was deleted (FK set null).
  multi_run_id: z.string().nullable(),
```

### 3.2 HTTP
`GET /pulls/:id/runs` → `200 RunSummary[]` — unchanged except every item now carries `multi_run_id: string | null` (AC-96). Workspace-scoped as today (UT-16). No new endpoint.

### 3.3 Client (U2)
```ts
// RunHistory props — added
prId?: string | null;

// RunHistory/_components/MultiAgentRunBadge/MultiAgentRunBadge.tsx
export function MultiAgentRunBadge(props: { prId: string; multiRunId: string }): JSX.Element;
// renders <Link href={multiAgentResultsUrl(prId, multiRunId)} aria-label title> <Badge icon="Users">…</Badge> </Link>
```
i18n — `client/messages/en/prReview.json`, block `timeline` (U2 adds): `multiAgent` "Multi-agent" · `multiAgentOpen` "Multi-agent — open the multi-agent results".

## 4. Work units

### U0 — Foundation (main session; not an implementer unit)
| Field | Value |
|---|---|
| Kind | orchestrator |
| Wave | 0 |
| Depends on | none |
| Owns (create/modify) | `server/src/vendor/shared/contracts/trace.ts`, `client/src/vendor/shared/contracts/trace.ts`, `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.test.tsx` (fixture default line only) |
| Must not touch | any other vendored block; migrations; schema |
| Consumes | — |
| Produces | §3.1 |
| Checks | `cd client && pnpm typecheck` (clean) · `cd server && pnpm typecheck` (expected: exactly one error, missing `multi_run_id` in `run.repo.ts` — closed by U1) |

**Steps**
1. Append §3.1 identically to `RunSummary` in both `trace.ts` copies (that block only).
2. In `RunHistory.test.tsx`, add `multi_run_id: null,` to the `run()` fixture defaults (after `cost_usd: null`). No other test change.
3. Commit Wave 0.

**Acceptance criteria**
- [ ] The added lines are byte-identical in both copies; client typecheck clean; server typecheck shows only the `run.repo.ts` error.

### U1 — Backend: expose `multi_run_id` from `GET /pulls/:id/runs`
| Field | Value |
|---|---|
| Kind | backend (→ `implementer-backend`) |
| Wave | 1 |
| Depends on | U0 |
| Owns (create/modify) | `server/src/modules/reviews/repository/run.repo.ts` |
| Must not touch | `server/src/vendor/**`, `server/src/db/**` (no migration), `routes.ts`, `service.ts`, `repository.ts`, `multi-agent*.ts`, `mcp/**`; no new test files (user decision) |
| Consumes | §3.1; `t.agentRuns.multiRunId` (`server/src/db/schema/runs.ts:34`) |
| Produces | §3.2 |
| Checks | `node scripts/agent-check.mjs server server/src/modules/reviews/repository/run.repo.ts` · `cd server && pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known` |

**Steps**
1. In `listRunsForPull`'s mapping (`run.repo.ts:51-68`) add `multi_run_id: run.multiRunId ?? null`. Keep the select, join, where and order unchanged (the full row is already selected).
2. Do not change `activeRunsForPull` (its shape is not `RunSummary`).

**Acceptance criteria** (code inspection + existing suites)
- [ ] Each item of `GET /pulls/:id/runs` carries `multi_run_id` = `agent_runs.multi_run_id` (multi-agent rows → their id; `POST /pulls/:id/review` rows → null) — SPEC-07 AC-96, EC-25.
- [ ] A deleted multi-agent run yields null through the FK `set null`, with no extra code — EC-24.
- [ ] The workspace filter `eq(t.agentRuns.workspaceId, workspaceId)` (`run.repo.ts:49`) is unchanged, so a foreign-workspace PR returns `[]` — UT-16.
- [ ] Every existing field keeps its name and value; still exactly one SQL statement per request.
- [ ] Server typecheck clean; depcruise clean, baseline not grown.

### U2 — UI: "Multi-agent" badge-link in timeline rows
| Field | Value |
|---|---|
| Kind | ui (→ `implementer-ui`) |
| Wave | 2 |
| Depends on | U0 (contract), U1 (field at runtime) |
| Owns (create/modify) | `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx`, `…/RunHistory/RunHistory.test.tsx` (only if an existing test breaks), `…/RunHistory/_components/MultiAgentRunBadge/MultiAgentRunBadge.tsx` (new), `…/RunHistory/_components/MultiAgentRunBadge/index.ts` (new), `…/RunHistory/_components/MultiAgentRunBadge/styles.ts` (new, only if needed), `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.tsx`, `client/messages/en/prReview.json` |
| Must not touch | `client/src/vendor/**`, `client/src/lib/multi-agent-urls.ts` (consume only), `client/src/lib/hooks/**` (no new request), `client/src/app/multi-agent/**`, the other `RunHistory` row content; no new test files (user decision) |
| Consumes | §3.1, §3.3; `multiAgentResultsUrl`; `@devdigest/ui` `Badge`; `next/link` |
| Produces | `MultiAgentRunBadge`; `RunHistory` `prId` prop |
| Checks | `node scripts/agent-check.mjs client <each owned file path, explicit>` (client INSIGHTS 2026-10-07) |

**Steps**
1. **Messages:** add `timeline.multiAgent` and `timeline.multiAgentOpen` (§3.3). No other key changes.
2. **`MultiAgentRunBadge`** (`'use client'` not needed — inherits from `RunHistory`): Next `Link` with `href={multiAgentResultsUrl(prId, multiRunId)}`, `aria-label` + `title` = `t("timeline.multiAgentOpen")`; child `<Badge icon="Users">{t("timeline.multiAgent")}</Badge>`. No `onClick`, no `preventDefault`, no `target`. Style objects (if any) in `styles.ts`. `index.ts` barrel exports it.
3. **`RunHistory`:** add optional `prId?: string | null` to props; after the outcome `Badge` render `{prId && r.multi_run_id ? <MultiAgentRunBadge prId={prId} multiRunId={r.multi_run_id} /> : null}` for every run status. Nothing else in the row changes. Update the header doc comment (one line).
4. **`FindingsTab`:** pass `prId={prId}` to `<RunHistory>`. Nothing else.
5. Run the existing `RunHistory.test.tsx`; it must pass unchanged beyond U0's fixture line.

**Acceptance criteria** (code inspection + existing suites)
- [ ] A row with non-null `multi_run_id` shows the badge whose `href` is `/multi-agent/<prId>?multiRunId=<that row's id>`; each row uses its own `r.multi_run_id`, so two rows of different multi-agent runs link to different runs — SPEC-07 AC-71, EC-27.
- [ ] A row with null `multi_run_id` renders no badge and its existing content unchanged; existing `RunHistory.test.tsx` passes — AC-93, EC-24, EC-25.
- [ ] The badge is an `<a href>` with the `Users` icon; its accessible name contains "Multi-agent" and says it opens the multi-agent results — AC-94.
- [ ] Activating it navigates via `Link` in the current tab; no `onClick`, `preventDefault`, `target` or mutation is attached, so no POST is sent and modifier-click is left to the browser — AC-95.
- [ ] The badge is rendered regardless of `status` (also `running`) with the same `href` — EC-26.
- [ ] The badge is derived only from the `runs` prop; no hook or `api` call is added in owned files — NFR-16.
- [ ] Native link → reachable by Tab, activates on Enter — NFR-17 (manual walk-through in §7).
- [ ] `href` is built only through `multiAgentResultsUrl` (`encodeURIComponent` on both parts), so a non-UUID `multi_run_id` such as `x&y=javascript:alert(1)` stays a percent-encoded query value under `/multi-agent/` — UT-15.
- [ ] Shared imports in owned files are `import type` only; all user-visible strings come from `prReview.json`.

## 5. Waves (execution order)
| Wave | Units | Runs | Why this order |
|---|---|---|---|
| 0 | U0 | sequential, main session | vendored contract in both copies + the one fixture line that the new required field breaks |
| 1 | U1 (backend) | sequential | closes the server typecheck; the field the badge reads |
| 2 | U2 (ui) | sequential | consumes §3.1 / §3.2 |

Ownership is disjoint: vendored files → U0 only; `prReview.json` → U2 only; `RunHistory.test.tsx` → U0 (fixture line), then U2 only if an existing test breaks (single-agent, sequential).

## 6. Test plan
- **No new tests (user decision).** Existing tests touched: `RunHistory.test.tsx` fixture (`multi_run_id: null`, U0). No server test builds `RunSummary` (§1).
- Existing suites per wave in `plan-verifier`: `node scripts/agent-check.mjs server --full --it` (run alone; check the skipped count) after U1; `node scripts/agent-check.mjs client --full` after U2; depcruise `--ignore-known`.
- **Spec "Verify by" → evidence (code inspection):**
  - AC-96, EC-24, EC-25, UT-16: `run.repo.ts` mapping + unchanged `where` + schema FK `set null`;
  - AC-71, EC-27: per-row `r.multi_run_id` passed to the badge;
  - AC-93: null branch renders nothing + existing `RunHistory.test.tsx` green;
  - AC-94, AC-95, NFR-17: `Link` + `aria-label` + icon, no handlers;
  - EC-26: badge condition does not read `status`;
  - NFR-16: no new hook/fetch in owned client files;
  - UT-15: `multiAgentResultsUrl` encoding (`multi-agent-urls.ts:5-6`).
- **EARS shapes to inspect:** WHERE AC-71/AC-93 (on: non-null id → badge; off: null → today's row); WHILE EC-26 (running → badge present; settled → same badge, same href); IF UT-15/UT-16 (hostile id → encoded; foreign workspace → `[]`).
- **Traceability:** AC-71, AC-93 – AC-96, EC-24 – EC-27, NFR-16, NFR-17, UT-15, UT-16 are each cited by U1 or U2. G-9 = AC-71 + AC-93 – AC-96.
- e2e: none.

## 7. Verification and review pipeline (orchestrator)
1. After U1: `plan-verifier scope=U1`. After U2: `plan-verifier scope=U2` (NOT MET → `mode: fix` of the owner).
2. After Wave 2: full server suite (alone) + depcruise; full client suite; `git diff --stat main -- reviewer-core/ ci/ agent-runner/ mcp/ server/src/db/` is empty.
3. One `architecture-reviewer` pass over the whole diff; one `security-reviewer` pass on the server files only (`run.repo.ts`, workspace scope). At most 1 fix round, then `plan-verifier scope=all`.
4. **Manual (main session):** `next dev` → a PR page with a multi-agent run and a single run: badge only on multi-agent rows; Tab to a badge, Enter → `/multi-agent/<prId>?multiRunId=<id>` for that row; Ctrl/Cmd-click opens a new tab; page loads (catches value imports).
5. `spec-creator implemented SPEC-07` (same PR) → `/pr-self-review`; accept DET-003 for the vendored `trace.ts` edit with a reason.

## 8. Risks
- **Transient server typecheck failure** between the Wave 0 commit and U1 (Decision 5) — expected; plan-verifier runs only after U1.
- **Vendored drift:** only the §3.1 lines may change, identically in both copies (the copies are already one line apart; do not resync). DET-003 needs an accept.
- **Other `RunSummary` builders** appearing later would fail typecheck (field is required) — intended; none exist today (§1).
- **No automated tests:** regressions surface only via review, existing suites and the manual check. Spec "Verify by" columns stay unexecuted (§9 follow-up).
- **Security:** the `href` is built from a response field; `multiAgentResultsUrl` encoding + Next `Link` keep it same-origin. Workspace scope unchanged. Grounding / `INJECTION_GUARD` untouched.
- depcruise: U1 changes a mapping line in an existing repository file only; baseline cannot grow.

## 9. Out of scope
- Everything else in SPEC-07 (done); deferred AC-57, AC-64 – AC-66 stay deferred.
- MCP tool output and e2e flows for the badge (spec Non-goals); `mcp/` code.
- Refactoring `RunHistory.tsx` (inline styles, no `index.ts` barrel) beyond the badge.

### Spec follow-ups (owner: user / spec author)
1. The revision's "Verify by" entries (unit RTL / integration) are not executed as automated tests in this implementation, by user decision — record it in the `implemented` note so the criteria are not read as test-backed.
