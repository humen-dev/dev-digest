# Pages — spec (client routes & data)

The route map and the data each screen must show. Behaviour/contract, independent
of styling. Pairs with [`./README.md`](./README.md) and the architecture in
[`../docs/ui-architecture.md`](../docs/ui-architecture.md).

## Routes
| Route | Screen | Primary data (hook → endpoint) |
|---|---|---|
| `/repos/:repoId/pulls` | PR list | `usePulls` → `GET /repos/:id/pulls` (`PrMeta[]`) |
| `/repos/:repoId/pulls/:number` | PR detail | `usePrReviews`, `usePrRuns`, `useRunEvents` |

## PR list (`/repos/:repoId/pulls`)
- Columns, in order: **Pull request · Author · Size · Score · Findings · Status ·
  Cost · Updated** (`COLUMN_KEYS` / `GRID` in `pulls/constants.ts`).
- **Score** ring: latest review score, `—` until reviewed.
- **Findings**: per-severity icon+count badges from `pr.findings`; `—` when none.
  Hovering the cell opens a read-only popover titled "N FINDINGS IN THIS RUN"
  previewing each finding (severity, title, category, `file:line`, confidence,
  rationale snippet). No action buttons here.
- **Cost**: `formatCost(pr.cost_usd)` — the PR's total review spend (sum of priced
  runs), `—` when unpriced.
- Filter chips (All / Needs review / Reviewed / Stale) + text filter + sort; status
  lives in the `?status` query param.

## PR detail (`/repos/:repoId/pulls/:number`)
- Tabs: **Overview** (PR body), **Agent runs**, **Files changed**.
- **Agent runs** has two sections:
  - **Timeline** — runs + commits newest-first; each settled run shows counts +
    `tok · cost`, and hovering a run row opens the findings preview popover.
  - **Review runs** — one collapsible card per run. Expanded, under the verdict /
    PR score, a per-run severity counter row «N CRITICAL · N WARNING · N SUGGESTION»
    (only present severities) doubles as a filter: click a level to show only that
    severity's finding cards, click again to clear.
- Finding cards in **Review runs** carry **Accept / Dismiss** actions (persisted via
  `useFindingAction`); the list popover is preview-only.

## Invariants
- No screen fetches outside a `src/lib/hooks/*` hook.
- Severity counts/filters recompute client-side from loaded findings — no model call
  on load or filter toggle.
