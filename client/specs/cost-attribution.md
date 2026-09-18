# Cost attribution — spec (client UI)

Render the USD cost of a review run in three surfaces. Data comes from the API
(see [`../../server/specs/cost-attribution.md`](../../server/specs/cost-attribution.md));
the client only formats and places it. **No new data calls** — cost rides on the
existing `PrMeta`, `RunSummary`, and `RunTrace` payloads.

## Display rule — `formatCost(n: number | null): string`
- `null` → `—` (never `$0.00`).
- real `0` → `$0.00` (free model).
- `>= 0.01` → `$0.000` (3 dp).
- sub-cent → **2 significant figures** (`$0.0013`, `$0.000042`). Fixed 4 dp would
  flatten a real cheap-model run (~$0.00004 on deepseek) to `$0.0000` and collapse
  distinct tiny costs onto one string, so precision follows magnitude.

## Surface 1 — PR list (`/repos/:repoId/pulls`)
- New **COST** column between `STATUS` and `UPDATED`.
- `COLUMN_KEYS` gains `"cost"`; `GRID` gains a right-aligned track (~78px).
- `PRRow` renders `formatCost(pr.cost_usd)`; `null` → muted `—`.
- i18n: `prReview.list.columns.cost`.

## Surface 2 — run timeline (PR detail · Agent runs)
- In `RunHistory`, settled runs show a compact `{tokens} tok · {cost}` line in
  the right-aligned meta block (below the time), e.g. `9,119 tok · $0.0013`.
- Uses existing `tokens_in`/`tokens_out` (sum) + `formatCost(cost_usd)`.
- Running / failed / cancelled runs: no cost line (or `—` when settled without
  a cost).

## Surface 3 — run-trace drawer (Stats grid)
- `TraceBody` Stats grid gains a 4th tile **Cost** =
  `formatCost(trace.stats.cost_usd)`, beside Duration / Tokens / Findings.
- i18n: `runs.trace.stat.cost`.

## States
- Loading: existing skeletons (no cost-specific state).
- No cost (`null`): `—`, consistent across all three surfaces.

## Testing (`pnpm test`, fetch mocked)
- `PRRow`: renders formatted cost; `—` when `cost_usd` null.
- `RunHistory`: shows `tok · $` line for settled priced runs; hidden otherwise.
- `TraceBody`: Cost tile shows value / `—`.
