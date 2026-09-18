# Cost attribution — spec (server + engine)

Surface the **USD cost of each review run** and expose it through the API so the
client can show it in three places: the PR list, the PR-detail run timeline, and
the run-trace drawer. **Zero additional model calls** — cost is read from data
the provider already returns.

## Decisions (locked)

| Question | Decision | Consequence |
|---|---|---|
| PR-list `cost_usd` | Cost of the **latest run** that has a cost | One latest-run-per-PR lookup |
| Persistence | New column `agent_runs.cost_usd`, store **real cost only** | Runs without a provider-reported cost → `null` (rendered `—`) |
| Historical runs | **No backfill** | Pre-feature runs show `null`/`—` |

## Source of truth — real vs estimated

`reviewer-core` (`review/run.ts`) already computes `ReviewOutcome.costUsd`, but it
**conflates** a real provider cost with an estimate:

- OpenRouter provider (`llm/openrouter.ts`): `costFromApi ?? estimate ?? null`
- `openai` / `anthropic` adapters: **always** `estimateCost(...)`

To store *real cost only*, a distinct signal is threaded end-to-end:

- `StructuredResult.apiCostUsd: number | null` — the provider-reported real cost
  (OpenRouter `usage.cost`); `null` when the provider does not report one
  (openai/anthropic; OpenRouter free-tier / missing `usage.cost`).
- `ReviewOutcome.apiCostUsd: number | null` — sum of per-chunk `apiCostUsd`;
  `null` when **no** chunk reported a real cost.
- The server persists `ReviewOutcome.apiCostUsd` (NOT `costUsd`) into
  `agent_runs.cost_usd`. The existing `costUsd` (real-or-estimate) is unchanged;
  other consumers keep using it.

## Data model

`agent_runs.cost_usd double precision NULL` (mirrors the existing
`eval_runs.cost_usd` / `ci_*` columns). Nullable: a run may have no real cost.
Migration is additive; **not applied on boot** — run `pnpm db:migrate`.

## Contract changes (`@devdigest/shared`, both vendored copies)

`reviewer-core` resolves `@devdigest/shared` → `server/src/vendor/shared`, so
**every** contract edit must be applied to both `server/src/vendor/shared` and
`client/src/vendor/shared` to keep the copies identical.

- `adapters.ts` · `StructuredResult` → `+ apiCostUsd: number | null`
- `contracts/platform.ts` · `PrMeta` → `+ cost_usd: z.number().nullish()`
- `contracts/trace.ts` · `RunSummary` → `+ cost_usd: z.number().nullable()`
- `contracts/trace.ts` · `RunStats` → `+ cost_usd: z.number().nullish()`
  (nullish so historical `run_traces` documents keep validating)

## API contracts

### `GET /repos/:id/pulls` → `PrMeta[]`
- Adds `cost_usd: number | null`.
- Value = `cost_usd` of the **most recent agent run (by `ran_at`) that has a
  non-null `cost_usd`** for that PR. Rationale: a just-failed newest run (cost
  `null`) must not blank the column when an earlier priced run exists.
- No priced run for the PR → `null`.

### `GET /pulls/:id/runs` → `RunSummary[]`
- Each row adds `cost_usd: number | null` straight from the row.

### `GET /runs/:id/trace` → `RunTrace`
- `stats.cost_usd: number | null`, written at run completion. Absent on
  historical traces → treated as `null`.

## Invariants
- **No extra model calls.** Cost derives from `usage` already in the completion
  response; failure/cancel paths persist `cost_usd = null`.
- Real cost only. An **estimated** cost is never written to `agent_runs.cost_usd`.
- `null` ≠ `0`. A genuine free-model `$0.00` (real `usage.cost === 0`) is stored
  as `0`; "no data" is `null`.

## Testing
- **reviewer-core** (`npm test`, hermetic): OpenRouter provider sets
  `apiCostUsd` from `usage.cost` and `null` when absent; `reviewPullRequest`
  sums `apiCostUsd` across chunks (single-pass + map-reduce).
- **server** (`*.it.test.ts`, DB): `completeAgentRun` persists `cost_usd`;
  `listRunsForPull` returns it; `GET /repos/:id/pulls` returns the latest priced
  run's cost; failed run → `null`.

## Build order
1. Contracts (`apiCostUsd`) in both copies.
2. reviewer-core (provider + `ReviewOutcome`) + tests.
3. DB schema + `db:generate` / `db:migrate`.
4. Server repo + run-executor + pulls route + `PrMeta`/`RunSummary`/`RunStats`.
5. Client (see `client/specs/cost-attribution.md`).
