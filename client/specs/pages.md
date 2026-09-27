# Pages — spec (client routes & data)

The route map and the data each screen must show. Behaviour/contract, independent
of styling. Pairs with [`./README.md`](./README.md) and the architecture in
[`../docs/ui-architecture.md`](../docs/ui-architecture.md).

## Routes
| Route | Screen | Primary data (hook → endpoint) |
|---|---|---|
| `/repos/:repoId/pulls` | PR list | `usePulls` → `GET /repos/:id/pulls` (`PrMeta[]`) |
| `/repos/:repoId/pulls/:number` | PR detail | `usePrReviews`, `usePrRuns`, `useRunEvents` |
| `/repos/:repoId/conventions` | Conventions board | `useConventions` → `GET /repos/:id/conventions` (`ConventionBoard`) — see [`conventions.md`](./conventions.md) |

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
- **Files changed** (Smart Diff) — defaults to **Smart order**: files grouped by role
  from `useSmartDiff` (`GET /pulls/:id/smart-diff`, see
  [`../../server/specs/smart-diff.md`](../../server/specs/smart-diff.md)) in the order
  core → tests → wiring → docs → boilerplate; each group header shows the role label
  and «N files». docs and boilerplate groups start collapsed; files inside expanded
  groups follow the `AUTO_EXPAND_MAX_LINES` rule.
  - Findings overlay comes from `usePrReviews` (latest review per agent, dismissed
    hidden — same rule as the server): group header «● N» = number of **files** with
    findings; file card = a dot without a number (distinct from the GitHub comment
    counter); under line `RIGHT:start_line` = severity bar + label (blocker / warning /
    suggestion) and the same `FindingCard` as Agent runs with Accept / Reject.
    Accept/Reject invalidates `["reviews", prId]`, so markers update without refetching
    smart-diff. Findings whose line is outside the diff are listed at the card's foot.
  - **Original order** toggle shows the flat GitHub order. If smart-diff fails, the tab
    falls back to Original order with the toggle disabled.

## Invariants
- No screen fetches outside a `src/lib/hooks/*` hook.
- Severity counts/filters recompute client-side from loaded findings — no model call
  on load or filter toggle.
