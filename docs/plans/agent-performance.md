# Agent Performance dashboard + per-agent Stats — development plan

| Field | Value |
|---|---|
| Status | approved (user, 2026-10-15) |
| Goal | A team lead opens `/agent-performance` (or an agent's Stats tab), picks 1 day / 30 days / a custom range, and sees runs, honest cost, duration and accept rate per agent; the dashboard row equals the Stats tab, no model is called. |
| Requirements source | [`specs/2026-10-15-agent-performance.md`](../../specs/2026-10-15-agent-performance.md) — SPEC-09, approved (input; never edited here) |
| Execution mode | multi-agent (parallel waves), chosen by the user 2026-10-15 |
| Packages touched | server · client · shared (vendored, both copies) |

## 1. Context
Today (evidence re-verified; the spec's *Problem* section has the rest):
- No route serves aggregates: `server/src/modules/agents/routes.ts:74-177` has no `/agents/performance` or `/agents/:id/stats`. `AgentsService` takes the whole `Container` (`agents/service.ts:54`) — drift, not extended here.
- `agent_runs` has every run field (`server/src/db/schema/runs.ts:8-39`); `reviews.run_id` has **no FK** (`server/src/db/schema/reviews.ts:19`); decisions are `findings.accepted_at` / `dismissed_at` (`reviews.ts:44-45`). No index on `agent_runs(workspace_id, ran_at)` or `reviews.run_id`. Statuses written: `running|done|failed|cancelled` (`server/src/modules/reviews/repository/run.repo.ts:98,109,136,147`). CI ingest writes no reviews (no `reviews` write under `server/src/modules/ci/`).
- Contracts `AgentPerf` (`server/src/vendor/shared/contracts/productionize.ts:134-186`) and `AgentStats` (`observability.ts:172-203`) are unused stubs; copies exist only in `server/` and `client/` vendor dirs.
- Client: GLOBAL nav has no item (`client/src/vendor/ui/nav.ts:45-51`); active key and label already exist (`client/src/components/app-shell/helpers.ts:37`, `client/messages/en/shell.json:27`); editor tabs in `AgentEditor/constants.ts:13-19`, page whitelist derived from it (`client/src/app/agents/[id]/page.tsx:19`), `setTab` keeps other params (`page.tsx:50-53`); tab label `editor.tabs.stats` exists (`client/messages/en/agents.json:55`). `Donut` legend hard-codes `toFixed(2)` (`client/src/vendor/ui/charts/Donut.tsx:50`); `MetricCard` delta too (`MetricCard.tsx:65`) and colours "up" as ok — not reusable for cost deltas. Reusable: `formatCost` (`client/src/lib/format-cost.ts:12`), `formatSeconds` (`client/src/lib/multi-agent-selection.ts:34`), `relativeTime` (`client/src/lib/relative-time.ts:2`), `Sparkline` (`client/src/vendor/ui/charts/Sparkline.tsx:4`). `agentPerformance.json` holds stale keys (subtitle differs from AC-3).
- Seed: 4 runs for PR #482 relative to seed time, inside an insert-once guard (`server/src/db/seed.ts:1046-1134`); no reviews linked by `run_id`, no decisions.

INSIGHTS relied on: server 2026-10-13 (round-trip timestamp validation), 2026-10-13 (µs vs ms), 2026-09-22 (ports = plain interfaces), 2026-09-23 (container inline wiring), 2026-09-21 (route tests need `MockAuthProvider`), 2026-10-07 (`.it` silently skips; timing ITs flaky in parallel), DET-006 (secret-shaped fixtures built at runtime), 2026-09-27 (throw-away DB for seed checks). client 2026-09-27 (type-only shared imports), 2026-09-29 (error on `!data`; `fireEvent`, no user-event), 2026-09-23 (vendored drift), 2026-09-22 (`nav.ts` edited in place), 2026-10-07 (pass explicit files to agent-check under `[id]`), 2026-10-06 (tabs derive from `TABS`), 2026-09-18 (cost format).

### Requirements review
Approved-spec fast path (feasibility + testability). Findings and resolution:
1. AC-61 cites "SPEC-07 EC-12", which is about column scrolling; no identity helper exists → user Q2a: new pure deterministic helper + test; reference fix → §9.
2. AC-57 example "−$1.20" conflicts with AC-54 (3 dp ≥ $0.01); `Donut` legend breaks AC-54 → user Q3a: AC-54 everywhere (`formatCostDelta` = sign + `formatCost(|Δ|)`), optional `formatValue` prop on vendored `Donut` (Wave 0); example → §9.
3. Demo needs data → user Q1a: separate re-runnable `server/src/db/seed-performance.ts` (U2); main seed and e2e untouched.
4. No indexes for the aggregate reads; spec forbids migrations → none planned; 3 constant queries + in-memory aggregation fit NFR-1 at 10k runs. If NFR-1 fails → §9.
5. `reviews.run_id` without FK → inner joins only (EC-10/EC-11 by construction). EC-19 holds by construction; still tested.
6. AC-12 custom label format and AC-17 Unknown-row presence unspecified → user accepted defaults (Decisions 7, 8).

Recommendations (all **accepted** 2026-10-15): R1 new read-only module `server/src/modules/agent-performance/` with ONE pure domain function for both endpoints; R2 shared client unit (period/URL/delta/KPI pieces) before the two screens; R3 commit the spec + `specs/README.md` in Wave 0 of this PR.

### Decisions
1. **One aggregation, two views.** `aggregatePerformance(input)` builds `AgentPerf`; `agentStats(input, agentId)` calls it on the agent-filtered input and projects the row. AC-29 holds by construction and is still property-tested. Rejected: separate SQL per endpoint (reference RC-15 drift).
2. **3 fixed queries + in-memory aggregation** (agents; counted runs of `[prevFrom, to]`; decision counts per run). Query count is independent of agent count (NFR-2). Rejected: per-agent queries (RC-14); full-SQL aggregation (rules would live in SQL, untestable as pure code).
3. **Module wiring** in `platform/container.ts` as a getter `agentPerformanceService` with override key `agentPerformanceRepo`, like `conventionsService` (`container.ts:237-249`). The module imports nothing from `agents`/`reviews`; read-only joins on their tables in its own repository (onion rule 8).
4. **Instant parsing** accepts `Z` or `±HH:MM` offsets (AC-8 sends local offsets), validated by component round trip (calendar-valid), because `reviews/domain/runs-cursor.ts:19` compares to `toISOString()` and would reject offsets; it is private to `reviews`, so `agent-performance/domain/period.ts` has its own.
5. **URL format:** `range=1d|30d|custom`; custom adds `from`/`to` as local dates `YYYY-MM-DD`; `sort=accept|runs|cost`, `dir=asc|desc`. Presets are resolved against `now` once per selection, so the query key is stable and Retry repeats the same period (AC-64).
6. **Shared client pieces** live in `client/src/components/agent-performance/` + `client/src/lib/` (2 consuming routes, frontend rule 1). `MetricCard` not reused (Context).
7. **AC-12 custom label:** `Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).formatRange` ("Oct 1 – 15"), year added when not the current year.
8. **Unknown agent row** present only with ≥ 1 counted run in the period; sorts last in API order.
9. **API row order (NFR-4):** existing agents by `name` then `id` (code-unit compare), Unknown agent last. Segments: value desc, then label.
10. **Seed demo PR:** U2 creates its own PR "Agent performance demo data" in the seeded demo repo as the idempotency marker, so PR #482 and e2e fixtures stay unchanged; `--refresh` deletes and re-creates (data ages out of 30d otherwise).

### Open questions
none

## 2. Affected modules
| Package | Touched? | Why / what changes | Architecture rule that applies |
|---|---|---|---|
| server | yes | new module `agent-performance` (domain, types, ports, repository, service, routes); container getter; module registry; demo seed script | onion: domain (1), service+ports (2), repository + `src/db` (3), routes + container + `modules/index.ts` (4); depcruise baseline must not grow |
| client | yes | sidebar item; `/agent-performance` route; Stats tab; shared period/KPI components; hooks; i18n | frontend-ui-architecture: thin page, route `_components`, `src/components/agent-performance/` (2 routes), data via `src/lib/hooks` |
| reviewer-core | no | grounding gate and `INJECTION_GUARD` untouched | — |
| e2e | no | spec has no e2e criterion | — |
| shared (vendored) | yes | `observability.ts`, `productionize.ts` in both copies, Wave 0 only | DET-003 accept with reason |

## 3. Contracts

### 3.1 Vendored Zod — `contracts/observability.ts` (both copies; replaces the `AgentStats` block at 172-203, `StatPoint` kept)
```ts
/** Closed period [from, to], ISO-8601 UTC. */
export const PerfPeriod = z.object({ from: z.string(), to: z.string() });
export type PerfPeriod = z.infer<typeof PerfPeriod>;
/** AC-34: 24 hour buckets when to−from ≤ 24 h, else one per 24 h counted back from `to`; oldest first. */
export const PerfRunBuckets = z.object({
  size: z.enum(['hour', 'day']),
  buckets: z.array(z.object({ start: z.string(), runs: z.number().int() })),
});
export type PerfRunBuckets = z.infer<typeof PerfRunBuckets>;
export const AgentStats = z.object({
  agent_id: z.string(), agent_name: z.string(),
  period: PerfPeriod, previous_period: PerfPeriod,
  runs: z.number().int(), unpriced_runs: z.number().int(),
  avg_cost_usd: z.number().nullable(), prev_avg_cost_usd: z.number().nullable(),
  avg_duration_ms: z.number().nullable(),
  accepted: z.number().int(), dismissed: z.number().int(), pending: z.number().int(), decided: z.number().int(),
  accept_rate: z.number().nullable(),
  run_buckets: PerfRunBuckets,
});
export type AgentStats = z.infer<typeof AgentStats>;
```

### 3.2 Vendored Zod — `contracts/productionize.ts` (both copies; replaces 134-186; add `import { PerfPeriod, PerfRunBuckets } from './observability.js';`)
```ts
export const PerfRecentRun = z.object({
  run_id: z.string(), ran_at: z.string(),
  status: z.enum(['done', 'failed', 'cancelled']), source: z.enum(['local', 'ci']),
  duration_ms: z.number().int().nullable(), cost_usd: z.number().nullable(),
});
export type PerfRecentRun = z.infer<typeof PerfRecentRun>;
export const AgentPerfRow = z.object({
  agent_id: z.string().nullable(),           // null = "Unknown agent" (AC-17)
  agent_name: z.string(),
  enabled: z.boolean().nullable(),           // null for Unknown agent
  runs: z.number().int(), unpriced_runs: z.number().int(),
  total_cost_usd: z.number().nullable(), avg_cost_usd: z.number().nullable(),
  avg_duration_ms: z.number().nullable(),
  accepted: z.number().int(), dismissed: z.number().int(), pending: z.number().int(), decided: z.number().int(),
  accept_rate: z.number().nullable(),
  prev_accept_rate: z.number().nullable(), prev_decided: z.number().int(),
  last_run_at: z.string().nullable(),
  recent_runs: z.array(PerfRecentRun).max(5),  // newest first (AC-35)
});
export type AgentPerfRow = z.infer<typeof AgentPerfRow>;
/** key: agent id | 'unknown-agent' | model | 'unknown-model' (stable colour/React key). */
export const PerfCostSegment = z.object({ key: z.string(), label: z.string(), value: z.number() });
export type PerfCostSegment = z.infer<typeof PerfCostSegment>;
export const AgentPerf = z.object({
  period: PerfPeriod, previous_period: PerfPeriod,
  summary: z.object({
    runs: z.number().int(),
    total_cost_usd: z.number().nullable(), prev_total_cost_usd: z.number().nullable(),
    unpriced_runs: z.number().int(), priced_ci_runs: z.number().int(),
    avg_accept_rate: z.number().nullable(), accepted: z.number().int(), decided: z.number().int(),
    most_active: z.object({
      agent_id: z.string().nullable(), agent_name: z.string(),
      runs: z.number().int(), accept_rate: z.number().nullable(),
    }).nullable(),
  }),
  run_buckets: PerfRunBuckets,
  agents: z.array(AgentPerfRow),
  cost_by_agent: z.array(PerfCostSegment),
  cost_by_model: z.array(PerfCostSegment),
});
export type AgentPerf = z.infer<typeof AgentPerf>;
```

### 3.3 HTTP
| Method · path | Query | 200 | Errors |
|---|---|---|---|
| `GET /agents/performance` | `from`, `to` (both or neither; absent → `[now − 720 h, now]`) | `AgentPerf` | 422 `validation_error`, issue path `from` or `to` (UT-1) |
| `GET /agents/:id/stats` | same | `AgentStats` | 404 `not_found` (unknown / other workspace, EC-14) · 422 |

Query rules: ISO-8601 instant `YYYY-MM-DDTHH:MM:SS(.f{1,6})?(Z|±HH:MM)`, calendar-valid by component round trip, `from ≤ to`, `to − from ≤ 366 × 24 h`. Validation happens before any DB call; no DB text in bodies.

### 3.4 Server module internals (U1 produces, U4 consumes)
```ts
// agent-performance/domain/period.ts — pure
export interface PeriodBounds { from: Date; to: Date }
export function parseInstant(raw: string): Date | null;
export function resolvePeriod(q: { from?: string; to?: string }, now: Date): PeriodBounds; // validated input
export function previousPeriod(p: PeriodBounds): PeriodBounds; // [from − (to − from), from)
export function runBuckets(p: PeriodBounds, runs: { ranAt: Date }[]): PerfRunBuckets;
// agent-performance/domain/aggregate.ts — pure
export interface PerfAgent { id: string; name: string; enabled: boolean }
export interface PerfRun { id: string; agentId: string | null; ranAt: Date; status: string;
  source: 'local' | 'ci'; model: string | null; durationMs: number | null; costUsd: number | null }
export interface PerfRunDecisions { runId: string; accepted: number; dismissed: number; pending: number }
export interface PerfInput { period: PeriodBounds; agents: PerfAgent[]; runs: PerfRun[]; decisions: PerfRunDecisions[] }
export function aggregatePerformance(input: PerfInput): AgentPerf;
export function agentStats(input: PerfInput, agentId: string): AgentStats; // input.agents contains agentId
// agent-performance/types.ts — PerfQuery zod schema (querystring) per §3.3
// agent-performance/ports.ts (U4)
export interface AgentPerformanceRepositoryPort {
  listAgents(workspaceId: string, agentId?: string): Promise<PerfAgent[]>;
  listCountedRuns(workspaceId: string, from: Date, to: Date, agentId?: string): Promise<PerfRun[]>;
  decisionsByRun(workspaceId: string, from: Date, to: Date, agentId?: string): Promise<PerfRunDecisions[]>;
}
```

### 3.5 Client shared modules (U3 produces, U5/U6 consume)
```ts
// src/lib/perf-period.ts — pure
export type PerfRange = "1d" | "30d" | "custom";
export interface PerfPeriodState { range: PerfRange; from?: string; to?: string } // custom: local YYYY-MM-DD
export type CustomRangeError = "order" | "future" | "tooLong";
export function parsePerfPeriod(sp: URLSearchParams, today: Date): PerfPeriodState;      // invalid → { range: "30d" }
export function validateCustomRange(from: string, to: string, today: Date): CustomRangeError | null;
export function resolvePerfPeriod(s: PerfPeriodState, now: Date): { from: string; to: string };
export function perfPeriodParams(s: PerfPeriodState): Record<string, string>;
export function customRangeLabel(from: string, to: string, locale: string, today: Date): string;
// src/lib/accept-rate.ts — pure
export const SMALL_SAMPLE_THRESHOLD = 5;
export function isSmallSample(decided: number): boolean; // 1..4
export function ratePercent(rate: number): number;       // whole %
// src/lib/format-cost.ts — added
export function formatCostDelta(delta: number): string;  // "−$1.200" (U+2212) | "+$0.500" | "$0.00"
// src/lib/use-perf-period.ts — 'use client', URL-bound (usePathname + useSearchParams + router.replace, keeps other params)
export function usePerfPeriod(): { state: PerfPeriodState; period: { from: string; to: string };
  selectPreset(r: "1d" | "30d"): void; applyCustom(from: string, to: string): CustomRangeError | null };
// src/lib/hooks/agent-performance.ts — GET only, built with URLSearchParams, no placeholderData (AC-66)
export function useAgentPerformance(p: { from: string; to: string }); // key ['agent-performance', from, to]
export function useAgentStats(agentId: string, p: { from: string; to: string }); // key ['agent-stats', id, from, to]
// src/components/agent-performance/<Name>/ (each with index.ts)
PeriodPicker { state, onPreset, onApplyCustom }      KpiCard { label, loading, value, footer?, aside? }
AcceptRateRing { accepted, decided, rate }           SmallSampleBadge { decided }
CostDelta { current, previous }                      RunsSparkline { buckets: PerfRunBuckets }
CostNotes { unpricedRuns, pricedCiRuns? }
```

### 3.6 i18n — `client/messages/en/agentPerformance.json` (written whole in Wave 0)
- `title` "Agent Performance" · `subtitle` "Which agents earn their keep — accept rate is the quality signal".
- `period`: `oneDay` "1 day" · `thirtyDays` "30 days" · `custom` "Custom range" · `from` "From" · `to` "To" · `apply` "Apply" · `short1d` "1d" · `short30d` "30d" · `errors.order` "The start date must be on or before the end date." · `errors.future` "The end date cannot be after today." · `errors.tooLong` "A custom range can span at most 365 days."
- `kpi`: `totalRuns` "Total runs · {period}" · `totalCost` "Total cost · {period}" · `avgAccept` "Avg accept rate" · `mostActive` "Most-active agent" · `decisions` "{accepted} / {decided} decisions" · `mostActiveMeta` "{runs} runs · {rate}% accept" · `mostActiveMetaNoRate` "{runs} runs" · `avgCostRun` "Avg cost/run" · `avgDuration` "Avg duration" · `acceptRate` "Accept rate" · `ringLabel` "Accept rate {rate}%" · `ringEmpty` "Accept rate not available".
- `cost`: `label` "Provider-reported, not reconciled with billing" · `unpriced` "{count} runs without a reported cost are not included" · `ciEstimate` "Includes CI runs whose cost may be an estimate" · `deltaLabel` "{delta} vs previous period".
- `trend`: `sparkline` "Runs per {size, select, hour {hour} other {day}}: first {first}, last {last}" · `up` "up from {rate}%" · `down` "down from {rate}%".
- `table`: `agent` "Agent" · `runs` "Runs" · `avgCost` "Avg cost" · `avgDuration` "Avg duration" · `acceptRate` "Accept rate" · `lastRun` "Last run" · `view` "View" · `rateCell` "{rate}% · {accepted}/{decided}" · `smallSample` "Small sample (n={n})" · `disabled` "Disabled" · `noRuns` "No runs in this period" · `unknownAgent` "Unknown agent" · `ago` "{time} ago" · `justNow` "just now" · `expand` "Show latest runs for {name}".
- `recent`: `time` · `status` · `source` · `duration` · `cost` · `statusValue.{done,failed,cancelled}` · `sourceValue.{local "Local", ci "CI"}`.
- `breakdown`: `heading` "Cost breakdown" · `byAgent` "By agent" · `byModel` "By model" · `noCost` "No reported cost in this period".
- `states`: `loadError` "Could not load agent performance." · `statsLoadError` "Could not load agent stats." · `retry` "Retry" · `emptyTitle` "No agent runs in this period" · `emptyCta` "Go to Pull Requests" · `zeroDecisions` "0 decisions".

## 4. Work units

### U0 — Foundation (main session; not an implementer unit)
| Field | Value |
|---|---|
| Kind | orchestrator |
| Wave | 0 |
| Depends on | none |
| Owns (create/modify) | `specs/2026-10-15-agent-performance.md` + `specs/README.md` (commit only, no edit), `server/src/vendor/shared/contracts/{observability,productionize}.ts`, `client/src/vendor/shared/contracts/{observability,productionize}.ts`, `client/messages/en/agentPerformance.json`, `client/src/vendor/ui/nav.ts`, `client/src/vendor/ui/charts/Donut.tsx` |
| Must not touch | other contract blocks (pre-existing drift stays), `Dev_Digest_Design/`, `docs/course/` |
| Produces | §3.1, §3.2, §3.6; nav item; `Donut.formatValue` |
| Checks | `cd server && pnpm typecheck` · `cd client && pnpm typecheck` |

**Steps**
1. Commit the spec and `specs/README.md` (R3).
2. Write §3.1/§3.2 identically in both copies.
3. Rewrite `agentPerformance.json` whole per §3.6.
4. `nav.ts` GLOBAL: insert `{ key: "agent-performance", label: "Agent Performance", icon: "Activity", href: "/agent-performance" }` between `multi-agent` and `ci-runs` (design `Dev_Digest_Design/chrome.jsx:18`).
5. `Donut`: optional `formatValue?: (v: number) => string`; default output unchanged.

**Acceptance criteria**
- [ ] The changed blocks are byte-identical across copies; both typechecks clean; existing `Donut` callers render unchanged.

### U1 — Backend: pure domain + query schema
| Field | Value |
|---|---|
| Kind | backend |
| Wave | 1 |
| Depends on | U0 |
| Owns (create/modify) | `server/src/modules/agent-performance/{constants,types}.ts`, `server/src/modules/agent-performance/domain/{period,aggregate}.ts`, `server/test/agent-performance-domain.test.ts`, `server/test/agent-performance-period.test.ts` |
| Must not touch | other modules, `container.ts`, `modules/index.ts` |
| Consumes | §3.1, §3.2 |
| Produces | §3.4 domain + `PerfQuery` |
| Checks | `node scripts/agent-check.mjs server <owned files>` · `cd server && pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known` |

**Steps**
1. `constants.ts`: `UNKNOWN_AGENT_NAME`, `UNKNOWN_MODEL_LABEL`, `DEFAULT_PERIOD_MS` (720 h), `MAX_PERIOD_MS` (366 × 24 h), `RECENT_RUNS_LIMIT` 5, `COUNTED_STATUSES`.
2. `period.ts`: `parseInstant` per §3.3 (Decision 4); `resolvePeriod`; `previousPeriod`; `runBuckets` (bucket k = `[to − (n−k)·size, to − (n−k−1)·size)`, last closed at `to`; n = 24 for hour, `ceil(len / 24 h)` for day).
3. `types.ts`: `PerfQuery` with `superRefine` issues on path `from`/`to` (both-or-neither, parse, order, span).
4. `aggregate.ts` (no I/O). Rules, from spec *Defined terms*:
   - counted = status ∈ done|failed|cancelled AND inside the period; current `[from, to]`, previous `[prevFrom, from)`;
   - priced = done AND cost finite ≥ 0 (negative/NaN → unpriced, UT-5); timed = done AND duration ≥ 0 (UT-6);
   - decisions summed over counted runs of the row; accept rate = accepted ÷ decided, null at 0;
   - rows per Decision 8/9; recent runs newest first (`ranAt` desc, `id` desc), max 5;
   - summary: Σ runs, pooled accept rate, most-active tie-break (runs desc, later `last_run_at`, name asc), `priced_ci_runs`;
   - segments: by row and by run model (`null` → Unknown model), only value > 0; Decision 9 order;
   - output ISO via `toISOString()`; `agentStats` = `aggregatePerformance` on input filtered to the agent, row projection + `prev_avg_cost_usd` + agent buckets.

**Acceptance criteria**
- [ ] avg cost of fixtures null / 0 / 0.02 = 0.01, all-null → null — SPEC-09 AC-18, EC-6.
- [ ] Failed / cancelled runs with duration and cost count in runs, excluded from both averages — AC-19, EC-5.
- [ ] 3 accepted, 1 dismissed, 2 pending → 0.75; decided 0 → null — AC-20.
- [ ] Random fixtures (property, ≥ 200 cases): Σ by-agent = Σ by-model = total within 1e-6; Σ row runs = total runs; buckets sum = total runs — AC-22, AC-24, AC-25, AC-30, AC-34.
- [ ] Model switch → two model segments; null model → "Unknown model" — AC-25, EC-4.
- [ ] Unpriced counts per row and total; −5 and NaN costs → unpriced; −1 ms duration excluded — AC-23, UT-5, UT-6.
- [ ] Most-active ties and empty → null — AC-26, EC-17, Q-2.
- [ ] Rows 1/1 and 10/100 → 11/101 pooled — AC-27.
- [ ] Previous-period total cost, per-row prev rate/decided, per-agent prev avg cost — AC-31, AC-32, AC-33.
- [ ] 30-day period → 30 day buckets; 24 h → 24 hour buckets — AC-34.
- [ ] 7 runs → 5 newest in order — AC-35.
- [ ] `running` run never counted — EC-1.
- [ ] Agent with no runs present with zeros/nulls; null-agent runs form one last row — AC-16, AC-17.
- [ ] For every agent of random fixtures, `agentStats` equals its row on runs/avg cost/avg duration/accept rate/accepted/decided — AC-29.
- [ ] Same input twice → deep-equal output — NFR-4.
- [ ] Period parsing: `2026-02-30T…Z`, reversed, 400-day span, only one bound → issue on the named path; `+03:00` offset accepted — UT-1; absent → `[now − 720 h, now]` — AC-14; bounds classification at `from`, `to`, `from − 1 ms`, `to + 1 ms` — AC-13.

### U2 — Backend: demo seed script (Q1a)
| Field | Value |
|---|---|
| Kind | backend |
| Wave | 1 |
| Depends on | none (existing schema) |
| Owns (create/modify) | `server/src/db/seed-performance.ts`, `server/test/seed-performance.it.test.ts` |
| Must not touch | `server/src/db/seed.ts`, `server/package.json`, `e2e/**`, agent rows |
| Consumes | `src/db/schema`, `DEFAULT_WORKSPACE_NAME` from `seed.ts` (import only) |
| Produces | `seedPerformanceDemo(db, { now?: Date; refresh?: boolean }): Promise<{ inserted: number; skipped: boolean }>` + CLI |
| Checks | `node scripts/agent-check.mjs server <owned files>` |

**Steps**
1. Find the default workspace, the seeded demo repo and the 5 seeded agents by name; fail with a clear message if the main seed was not run.
2. Marker = a demo PR "Agent performance demo data" (Decision 10) in that repo: present and no `--refresh` → `skipped: true`; `--refresh` → delete its `agent_runs` (by `pr_id`) then the PR (cascades reviews/findings), re-insert.
3. Insert ~50 runs relative to `now`: ≥ 4 in the last 24 h; across 30 days; ~8 in days 31–59 (previous period) with decisions; one agent switches model mid-period; 4 `source='ci'` priced runs without reviews; 2 done runs with null cost; failed + cancelled runs; 1 `running`; 3 runs with `agent_id` null + reviews; one agent with only 1–4 decided findings; one agent only in the previous period.
4. Reviews (`kind='review'`, `run_id`) + findings with accepted / dismissed / pending mixes (multiple agents with ≥ 5 decided).
5. CLI: `cd server && pnpm exec tsx src/db/seed-performance.ts [--refresh]`, `DATABASE_URL` required (mirror `seed.ts:1283-1302`).

**Acceptance criteria**
- [ ] On a fresh migrated + seeded Testcontainers DB: first call inserts ≥ 40 runs spanning ≥ 25 distinct days; second call `skipped: true`, row counts unchanged; `refresh` keeps counts equal (Q1a).
- [ ] Main-seed rows of PR #482 (runs, reviews) are unchanged by both calls (Q1a).

### U3 — UI: shared period, KPI pieces, hooks, nav tests
| Field | Value |
|---|---|
| Kind | ui |
| Wave | 1 |
| Depends on | U0 |
| Owns (create/modify) | `client/src/lib/{perf-period,perf-period.test,accept-rate,use-perf-period}.ts`, `client/src/lib/format-cost.ts`, `client/src/lib/format-cost.test.ts`, `client/src/lib/hooks/agent-performance.ts`, `client/src/components/agent-performance/{PeriodPicker,KpiCard,AcceptRateRing,SmallSampleBadge,CostDelta,RunsSparkline,CostNotes}/**` (component, `styles.ts`, `index.ts`, colocated tests), `client/src/components/app-shell/helpers.test.ts`, `client/src/components/app-shell/nav.test.ts` |
| Must not touch | `client/src/lib/api.ts` (use `api.get`), `src/vendor/**`, messages |
| Consumes | §3.1, §3.2, §3.6 |
| Produces | §3.5 |
| Checks | `node scripts/agent-check.mjs client <owned files>` (explicit files) |

**Steps**
1. `perf-period.ts` + `accept-rate.ts` + `formatCostDelta` per §3.5; custom bounds = local 00:00:00.000 / 23:59:59.999 with `±HH:MM` offset; span counted in calendar days inclusive.
2. `use-perf-period.ts`: resolve presets once per state change (Decision 5); invalid custom → returns error, URL unchanged.
3. Hooks: GET only, `URLSearchParams` (so `+` is encoded), no `placeholderData`.
4. Components: texts from `agentPerformance`; `KpiCard` loading → skeleton, no digits; `AcceptRateRing` SVG with `role="img"` + aria-label; `CostDelta` colour `var(--ok)` for decrease, `var(--crit)` for increase, hidden when either value null; `RunsSparkline` wraps `Sparkline` in `role="img"` with the §3.6 label; `CostNotes` = label always + conditional notes.
5. `nav.test.ts`: GLOBAL group order; `helpers.test.ts`: active key.

**Acceptance criteria**
- [ ] GLOBAL items[1] is `agent-performance` → `/agent-performance` between Multi-Agent Review and CI Runs — AC-1; `activeKeyFor('/agent-performance')` → `agent-performance` — AC-2.
- [ ] Picker lists 1 day / 30 days / Custom range — AC-4; empty or `range=999d` or `sort=<img onerror>`-style junk → 30 days — AC-5, EC-21, UT-2.
- [ ] Fake clock: 1d → exactly 24 h ending now; 30d → now − 720 h — AC-6, AC-7.
- [ ] `TZ=Europe/Kyiv`: custom D1..D2 → `…T00:00:00.000+03:00` / `…T23:59:59.999+03:00` (DST-correct offset) — AC-8.
- [ ] D1 > D2, D2 > today, > 365 days → error kind, no request, previous period kept, message per rule — AC-9.
- [ ] Preset/custom selection calls `router.replace` with `range`(+`from`,`to`) keeping other params; URL restores state — AC-10, AC-11 (period part).
- [ ] `customRangeLabel` per Decision 7 — AC-12.
- [ ] Ring: 11/101 → "11%" + "11 / 101 decisions"; decided 0 → "—" + "0 decisions"; accessible name states the value — AC-37, EC-8, NFR-6.
- [ ] Badge for decided 3 → "Small sample (n=3)", none for 0 or 5 — AC-41, AC-73.
- [ ] `formatCostDelta(−1.2)` → "−$1.200" in ok colour; +0.5 → "+$0.500" crit colour; hidden on null — AC-57, AC-74, AC-54, EC-15.
- [ ] Sparkline accessible name with bucket size and first/last counts — AC-58.
- [ ] Notes: label always; unpriced 2 → note, 0 → absent; priced CI > 0 → CI note, 0 → absent — AC-51, AC-52, AC-53, AC-72.
- [ ] Rendering uses the `en` catalog, no literal UI strings in components — NFR-8.

### U4 — Backend: repository, service, routes, wiring, integration tests
| Field | Value |
|---|---|
| Kind | backend |
| Wave | 2 |
| Depends on | U1 |
| Owns (create/modify) | `server/src/modules/agent-performance/{ports,repository,service,routes}.ts`, `server/src/platform/container.ts`, `server/src/modules/index.ts`, `server/test/agent-performance.it.test.ts`, `server/test/agent-performance-perf.it.test.ts` |
| Must not touch | U1 files (consume only), `agents/**`, `reviews/**`, schema, migrations |
| Consumes | §3.1–§3.4 |
| Produces | §3.3 endpoints |
| Checks | `node scripts/agent-check.mjs server <owned files>` · depcruise (as U1) · run each `.it` file alone and check the skipped count |

**Steps**
1. `ports.ts` per §3.4 (plain interfaces; domain types only).
2. `repository.ts`: 3 read-only queries (Decision 2) over `[prevFrom, to]`, all filtered by `workspace_id` (`agent_runs`, `reviews`, agents); inner join `reviews.run_id = agent_runs.id`, `findings.review_id = reviews.id`; accepted = `accepted_at` set, dismissed = `dismissed_at` set and not accepted, pending = neither; never select `error`.
3. `service.ts` `AgentPerformanceService({ repo, now })`: `performance(ws, q)` and `stats(ws, agentId, q)` (agent missing → `NotFoundError`); the three repo calls in `Promise.all`; no write, no LLM.
4. `routes.ts`: zod `querystring: PerfQuery`, `params: IdParams`, `response: { 200: AgentPerf | AgentStats }`; `getContext` in the route.
5. `container.ts` getter + `ContainerOverrides.agentPerformanceRepo` (Decision 3); register the plugin in `modules/index.ts`.

**Acceptance criteria**
- [ ] Runs at `from`, `to`, `from − 1 ms`, `to + 1 ms` → first two counted — AC-13, EC-2; no params: run at now − 721 h excluded, now − 719 h included — AC-14.
- [ ] `/agents/:id/stats` for two periods returns the seeded counts — AC-15; unknown id / other workspace → 404 — EC-14.
- [ ] Agent with no runs and a disabled agent present with `runs 0` / `enabled false` — AC-16; deleted agent → one Unknown agent row incl. its findings — AC-17, EC-3.
- [ ] Accepted/dismissed/pending/decided equal seeded decisions; accept then dismiss → dismissed — AC-21, EC-9.
- [ ] Σ priced costs; all unpriced → null; unpriced count 2 — AC-22, AC-23; latest `ran_at` per row — AC-28; previous-only runs → previous total set, current null; prev rate/decided; per-agent prev avg — AC-31, AC-32, AC-33; 7 runs → 5 newest — AC-35.
- [ ] Seeded workspace, 3 periods × every agent: stats equal the row field-by-field — AC-29.
- [ ] `running` run → totals unchanged — EC-1; deleted run → totals drop, orphan review excluded — EC-10, EC-11; review without `run_id` excluded — EC-11.
- [ ] 3-agent multi-run (`multi_run_id` set) → +1 run per agent — EC-18; CI run (`source='ci'`) counted in runs/cost/duration, 0 decisions — EC-19.
- [ ] `GET /agents/performance` → 200 aggregates, not an agent lookup error — EC-13.
- [ ] `2026-02-30…`, reversed, 400-day span → 422 naming the parameter, no DB text — UT-1.
- [ ] Run `error` containing a token (built at runtime) absent from both bodies — UT-7.
- [ ] LLM override stub: 0 calls; `agent_runs` count unchanged after both GETs — AC-67, NFR-3.
- [ ] Two identical requests → deep-equal bodies incl. order — NFR-4; second workspace's data never counted — NFR-9.
- [ ] Perf IT: 50 agents × 200 runs → response < 1000 ms — NFR-1; drizzle instance with a counting `logger` passed as `db` to `buildApp`: equal query count for 1 and 50 agents — NFR-2.

### U5 — UI: Agent Performance page
| Field | Value |
|---|---|
| Kind | ui |
| Wave | 2 |
| Depends on | U3 |
| Owns (create/modify) | `client/src/app/agent-performance/page.tsx`, `client/src/app/agent-performance/_components/AgentPerformanceView/**` (view, `helpers.ts`, `constants.ts`, `styles.ts`, `index.ts`, `useAgentTableSort.ts`, tests, nested `_components/{KpiRow,AgentTable,AgentTableRow,RecentRuns,CostBreakdown,AgentIdentity}/**`) |
| Must not touch | U3 files (consume only), `src/vendor/**`, messages, `src/lib/**` |
| Consumes | §3.2, §3.5, §3.6 |
| Produces | route `/agent-performance` |
| Checks | `node scripts/agent-check.mjs client <owned files>` (explicit files) |

**Steps**
1. Thin page: `AppShell` crumb + `<Suspense>` around the view (`useSearchParams`).
2. View: `usePerfPeriod` → `useAgentPerformance`; early returns: loading placeholders (no digits) → error (`!data`) with Retry = `refetch` → empty (`summary.runs === 0`) with link to `/` → data.
3. Header (title, subtitle, `PeriodPicker`); `KpiRow` (4 `KpiCard`s, period label in Total runs/cost, `CostDelta`, `CostNotes`, `RunsSparkline`, ring, most-active).
4. `helpers.ts`: `parseSort` (default accept/desc, junk → default), `sortRows` per AC-42/44/45 (trailing groups fixed), trend arrow rule (both periods ≥ 5 decided and rates differ).
5. `AgentTable`: sortable headers as buttons with `aria-sort`; rows with `AgentIdentity`, Disabled badge, rate cell, badge, last run (`relativeTime` + `title` ISO), View link (`/agents/<id>?tab=stats&…perfPeriodParams`), expand button (`aria-expanded`) → `RecentRuns` from `recent_runs`; zero-run rows dimmed.
6. `AgentIdentity/helpers.ts`: `agentIdentity(id)` → stable hash → icon from a fixed `IconName` list + colour from a palette (Q2a); Unknown agent fixed neutral.
7. `CostBreakdown`: two `Donut`s with `formatValue={formatCost}`, colours from identity / model palette; EC-7 message instead of both.

**Acceptance criteria**
- [ ] Heading + subtitle — AC-3; four KPI cards — AC-36; period named in Total runs/cost labels — AC-12.
- [ ] Sort/dir written to and restored from the URL; `sort=<img onerror>` → default, no element, text not rendered — AC-10, AC-11, UT-2.
- [ ] Most-active "142 runs · 78% accept" pattern — AC-38; columns Agent…View — AC-39; "78% · 45/58" — AC-40; badge n=3 / none at 5 — AC-41.
- [ ] Mixed fixture both directions → expected order; default accept desc; Runs/Avg cost header → desc, nulls last, ties by name; second click reverses head, same tail; `aria-sort` + Enter toggles — AC-42, AC-43, AC-44, AC-45, NFR-5.
- [ ] View `href` contains `tab=stats&range=…`; Unknown agent row has no link; Disabled badge — AC-46, AC-47, AC-48.
- [ ] WHILE runs = 0 and others > 0: dimmed, "No runs in this period", "—" cells; leave (runs > 0) → numbers — AC-49.
- [ ] Donut legends list every segment with `formatCost` values; cost label twice; unpriced / CI notes present then absent — AC-50, AC-51, AC-52, AC-53, AC-54.
- [ ] 6200 ms → "6.2s"; "4m ago" + ISO accessible description — AC-55, AC-56.
- [ ] Cost delta text/colour; sparkline name; arrow "up from 70%" for 0.78 vs 0.70, none when prev < 5 decided — AC-57, AC-58, AC-59, EC-16.
- [ ] Expand → 5 runs with time/status/source/duration/cost; collapse hides; `aria-expanded` toggles; zero-run row → "No runs in this period" — AC-60, NFR-7, EC-20.
- [ ] Same agent id → same icon/colour across renders — AC-61 (Q2a).
- [ ] Pending → no digits in KPI/table/breakdown, then values; rejected fetch → message + Retry, no "0"; Retry → second identical GET; total 0 → empty state with Pull Requests link, no table; period change with pending fetch → placeholders only — AC-62, AC-63, AC-64, AC-65, AC-66.
- [ ] Fetch mock records only GET across load, sort, expand, period change — AC-67, AC-68.
- [ ] EC-7 "—" + "No reported cost in this period"; EC-8 "—" + "0 decisions"; 200-char name → full accessible name; `<b>x</b>` agent and model names rendered literally — EC-7, EC-8, EC-12, UT-3, UT-4; donut/ring/arrow text equivalents — NFR-6; strings from the catalog — NFR-8.

### U6 — UI: agent Stats tab
| Field | Value |
|---|---|
| Kind | ui |
| Wave | 2 |
| Depends on | U3 |
| Owns (create/modify) | `client/src/app/agents/[id]/_components/AgentEditor/constants.ts`, `.../AgentEditor/AgentEditor.tsx`, `.../AgentEditor/AgentEditor.test.tsx`, `.../AgentEditor/_components/StatsTab/**` (`StatsTab.tsx`, `StatsTab.test.tsx`, `styles.ts`, `index.ts`) |
| Must not touch | `client/src/app/agents/[id]/page.tsx`, U3/U5 files, messages |
| Consumes | §3.1, §3.5, §3.6 |
| Produces | `?tab=stats` |
| Checks | `node scripts/agent-check.mjs client <owned files>` (explicit files) |

**Steps**
1. Add `{ key: "stats", labelKey: "editor.tabs.stats", icon: "BarChart" }` between `evals` and `ci`; render `StatsTab` in `AgentEditor`.
2. `StatsTab`: `PeriodPicker` + `usePerfPeriod` + `useAgentStats`; loading → placeholders; error (`!data`) → "Could not load agent stats." + Retry; runs 0 → "No runs in this period" + "—" KPIs; else 4 `KpiCard`s.

**Acceptance criteria**
- [ ] Tab order Config, Skills, Context, Evals, Stats, CI — AC-69.
- [ ] Total runs + sparkline, Avg cost/run, Avg duration ("6.2s"), Accept rate ring + decisions from the fixture — AC-70, AC-55, AC-54.
- [ ] URL from a dashboard View link (`range=custom&from&to`) → same period selected — AC-71.
- [ ] Cost label always; unpriced note when > 0 — AC-72; badge at decided 2 — AC-73; avg-cost delta text/colour — AC-74.
- [ ] Pending → no digits, resolved → values — AC-75; rejected → error text + Retry, not "No runs" — AC-76; runs 0 → text + "—", runs > 0 → values — AC-77.
- [ ] Only GET requests from the tab — AC-67, AC-68; strings from the catalog — NFR-8.

## 5. Waves (execution order)
| Wave | Units | Runs | Why this order |
|---|---|---|---|
| 0 | U0 | sequential, main session | contracts, catalog, nav, `Donut` prop are shared |
| 1 | U1, U2, U3 | parallel | disjoint files; server domain, seed and client shared pieces need only Wave 0 |
| 2 | U4, U5, U6 | parallel | U4 needs U1; U5/U6 need U3; disjoint files |

Serialized files: `server/src/modules/index.ts` and `container.ts` → U4 only; `client/messages/en/*.json`, `**/src/vendor/**` → U0 only; `client/src/lib/api.ts` untouched; no migration.

## 6. Test plan
| Package | Tests | Owner |
|---|---|---|
| server unit | `agent-performance-domain.test.ts` (rules, property tests AC-24/25/29/30/34, NFR-4), `agent-performance-period.test.ts` (UT-1, AC-13/14 bounds, buckets) | U1 |
| server `.it` | `agent-performance.it.test.ts` (AC-13…AC-35 integration rows, EC-1/2/3/9/10/11/13/14/18/19, UT-1/7, AC-67, NFR-3/4/9); `agent-performance-perf.it.test.ts` (NFR-1, NFR-2); `seed-performance.it.test.ts` | U4, U2 |
| client unit | `perf-period.test.ts` (fake clock, `TZ=Europe/Kyiv`), `format-cost.test.ts`, component tests in `src/components/agent-performance/**`, `nav.test.ts`, `helpers.test.ts` | U3 |
| client component | `AgentPerformanceView.test.tsx` + `helpers.test.ts` + nested tests (fetch mocked, `NextIntlClientProvider` with `agentPerformance.json`, `fireEvent`) | U5 |
| client component | `StatsTab.test.tsx`, `AgentEditor.test.tsx` | U6 |
| e2e | none | — |

EARS shapes: WHILE criteria (AC-49, AC-52, AC-53, AC-62, AC-65, AC-66, AC-75, AC-77) assert entering and leaving the state; IF…THEN (AC-9, AC-63, AC-76, EC-*, UT-*) inject the fault (rejected fetch, hostile fixture, invalid range).

## 7. Verification (orchestrator, after merge)
1. `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'`; `pnpm exec vitest run test/agent-performance.it.test.ts`, then the perf IT alone (skipped count = 0); `pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known`.
2. `cd client && pnpm typecheck && pnpm test && pnpm build` (`build` catches value imports from the vendored barrel).
3. Demo: `cd server && pnpm exec tsx src/db/seed-performance.ts`; open `/agent-performance` (30d with data), View one agent → Stats equals its row; custom range a year ago → empty state; stop the API → error + Retry.
4. `plan-verifier scope=all` → reviews → `spec-creator implemented SPEC-09` → `/pr-self-review` (DET-003 `accept` for the vendored contracts: "SPEC-09 contract change, identical in both copies").

## 8. Risks
- **Route clash** `/agents/performance` vs `/agents/:id` across plugins: find-my-way gives static segments priority; EC-13 IT proves it.
- **Offset instants in the query**: a hand-built query string turns `+03:00` into a space → 422. Hooks must use `URLSearchParams`; U3 test asserts the encoded `%2B`.
- **Float sums** for AC-24/25: tolerance 1e-6; sum in one pass per group.
- **NFR-1 timing flake** under parallel load (server INSIGHTS 2026-10-07): run the perf IT alone; no index is allowed without a spec change (§9).
- **Vendored contracts**: two copies, pre-existing drift; DET-003 accept. Client must import shared **types only**.
- **Same-checkout parallelism**: Wave 1 and 2 units share no files; U5/U6 only import U3; U4 only imports U1.
- **depcruise**: the new module must import nothing from `agents/` or `reviews/` internals; container imports only its repository/service.
- **Seed side effect**: the demo PR shows up in the demo repo's PR list — intended, removable with `--refresh` logic; main seed/e2e untouched.
- **Known gap (accepted, out of scope)**: the agent rail on `/agents/:id` navigates with `?tab=` only (`page.tsx:110`), dropping the period.

## 9. Out of scope
Spec non-goals (other Stats panels, agent card figures, billing reconciliation, extra sidebar items, caching, CI model correction). No e2e flow.

### Spec follow-ups (owner: user / spec author)
1. AC-61 cites "SPEC-07 EC-12", which is about column scrolling; state the derived-identity rule in SPEC-09 itself.
2. AC-57 example "−$1.20" should read "−$1.200" under AC-54 (same for AC-74 examples).
3. Record the accepted defaults: AC-12 custom label format (Decision 7); AC-17 Unknown agent row only with ≥ 1 counted run (Decision 8); URL format of custom `from`/`to` (Decision 5).
4. If NFR-1 cannot be met without an index on `agent_runs(workspace_id, ran_at)` / `reviews(run_id)`, *Data and state* ("no migration") must change first.
