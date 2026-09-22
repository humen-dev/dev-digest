# server — INSIGHTS

Running log of **non-obvious** learnings the code doesn't reveal on its own:
gotchas hit while debugging, why a surprising decision was made, sharp edges to
avoid. Linked (not preloaded) from [`CLAUDE.md`](./CLAUDE.md) — read on demand.

> Not for: standard Fastify/Drizzle rules, lint-caught issues, or file-by-file
> description (Claude reads the code). One insight per bullet; newest on top.
> Date each entry so stale ones are easy to prune.

## What Works
_(none yet)_

## What Doesn't Work
_(none yet)_

## Codebase Patterns
- 2026-09-22 — `server/.dependency-cruiser.cjs` does NOT exist on `main` (nor on any fresh `feature-L0N` branch cut from it) even though `AGENTS.md`'s onion-architecture checklist references `pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known`. It was added on `422e203` then removed again by `c6af1e4 revert: restore main to the starter state, homework belongs in forks` — depcruise enforcement is itself lesson/homework content, not part of the starter. On a branch without the config, verify onion boundaries by construction instead (module's `service.ts` importing only its own `ports.ts` + narrow adapters, never `platform/container.ts`) and say so explicitly in any report rather than silently skipping the check or trying to regenerate a baseline file that was never meant to be on this branch.
- 2026-09-22 — When seeding a PR fixture for a demo repo (e.g. `acme/payments-api`, no real git clone) the reviewer's diff loader (`server/src/modules/reviews/diff-loader.ts:33` `diffFromPrFiles`) falls back to reconstructing a `UnifiedDiff` from `pr_files.patch` via `parseUnifiedDiff` — so each seeded `pr_files` row's `patch` column must hold a REAL unified-diff hunk body (`@@ -a,b +c,d @@` + context/added/removed lines), not just additions/deletions counts or a description. A patch with only metadata parses to zero hunks and the review sees an empty diff. Verify with the actual `parseUnifiedDiff` (`server/src/adapters/git/diff-parser.ts`) against the assembled `diff --git a/<path> b/<path>` + `--- a/<path>` + `+++ b/<path>` + `f.patch` text before trusting new-side line numbers in any skill/finding examples that cite `file:line` — an off-by-one here silently points findings at the wrong line.
- 2026-09-19 — The PR list (`GET /repos/:id/pulls`) enriches each `PrMeta` with fields computed on READ (no denormalization): latest-review `score`, `cost_usd`, and `findings` — each a single `IN (...prIds)` query + JS grouping (`server/src/modules/pulls/routes.ts:114-190`). `findings` aggregates across **all** `kind='review'` reviews of a PR (matches the detail page), mapped to the `Finding` contract via `findingRowToDto` (`server/src/modules/reviews/helpers.ts:34`). **SUPERSEDES the 2026-09-18 cost note below:** PR-list `cost_usd` is now the **SUM** of every priced run for the PR (its total spend), not the latest priced run (`server/src/modules/pulls/routes.ts:132-155`).
- 2026-09-18 — Only OpenRouter reports a REAL per-call USD cost (`usage.cost`); the `openai`/`anthropic` adapters always return `estimateCost(...)` (`server/src/adapters/llm/openai.ts:84`). Persist real cost only: `run-executor` writes `ReviewOutcome.apiCostUsd` into `agent_runs.cost_usd` (null for openai/anthropic/unpriced runs), never the estimate (`server/src/modules/reviews/run-executor.ts`). PR-list COST is the latest run whose `cost_usd` is non-null, so a just-failed newest run doesn't blank the column (`server/src/modules/pulls/routes.ts`).

## Tool & Library Notes
_(none yet)_

## Recurring Errors & Fixes
- 2026-09-18 — Deriving a parent dir with `full.lastIndexOf('/')` breaks on Windows: `path.join` normalizes separators to `\`, so there is no `/` → `slash = -1` → `mkdir` skipped → `writeFile` fails ENOENT (6 tests). ALWAYS use `dirname()` for the parent dir, never a hardcoded `/` scan (`server/test/indexer-pipeline.test.ts:140`).

## Session Notes
_(none yet)_

## Open Questions
_(none yet)_
