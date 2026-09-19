# client — INSIGHTS

Running log of **non-obvious** learnings the code doesn't reveal on its own:
gotchas hit while debugging, why a surprising decision was made, sharp edges to
avoid. Linked (not preloaded) from [`CLAUDE.md`](./CLAUDE.md) — read on demand.

> Not for: standard React/Next rules, lint-caught issues, or file-by-file
> description (Claude reads the code). One insight per bullet; newest on top.
> Date each entry so stale ones are easy to prune.

## What Works
_(none yet)_

## What Doesn't Work
- 2026-09-18 — A fixed-decimal cost format (e.g. 4 dp under a cent) FLATTENS real cheap-model costs: a deepseek/OpenRouter review run costs ~$0.00004, which 4 dp renders as "$0.0000" (looks free) and collapses distinct tiny values ($0.000175 vs $0.000248) onto one string. Use 2 significant figures below $0.01 (`toPrecision(2)`), keep 3 dp at/above $0.01 (`client/src/lib/format-cost.ts:12`). Only surfaced against LIVE seeded costs in the browser — the design mock values ($0.0013+) hid it.

## Codebase Patterns
- 2026-09-19 — A hover popover anchored inside the PR-list table (`client/src/app/repos/[repoId]/pulls/styles.ts:91` `tableCard` has `overflow:hidden`) gets CLIPPED if positioned `absolute` within a row — worst on the last row. Render it in a **portal to `document.body`** with `position:fixed` computed from the trigger's `getBoundingClientRect()`, and clamp `maxHeight` to `innerHeight - top - 12` so it never overflows the viewport (no flip logic needed). See `client/src/app/repos/[repoId]/pulls/_components/FindingsHoverCard/FindingsHoverCard.tsx:73`. There is no Tooltip/Popover primitive in `@devdigest/ui` — only a click `Dropdown` (`vendor/ui/kit`), so hover popovers are hand-rolled; reuse `FindingsHoverCard` + `FindingsPreviewList` (shared by the list cell and the Agent-runs timeline).

## Tool & Library Notes
_(none yet)_

## Recurring Errors & Fixes
_(none yet)_

## Session Notes
_(none yet)_

## Open Questions
- 2026-09-18 — The three cost UI surfaces (`PRRow` COST column, `RunHistory` `tok · cost` line, `TraceBody` Cost tile) have NO component render tests — cost is covered only by the `formatCost` unit test (`client/src/lib/format-cost.test.ts:1`) + a manual browser check. Add render assertions (value + "—" on null) when next touching them.
