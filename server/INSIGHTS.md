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
- 2026-09-18 — Only OpenRouter reports a REAL per-call USD cost (`usage.cost`); the `openai`/`anthropic` adapters always return `estimateCost(...)` (`server/src/adapters/llm/openai.ts:84`). Persist real cost only: `run-executor` writes `ReviewOutcome.apiCostUsd` into `agent_runs.cost_usd` (null for openai/anthropic/unpriced runs), never the estimate (`server/src/modules/reviews/run-executor.ts`). PR-list COST is the latest run whose `cost_usd` is non-null, so a just-failed newest run doesn't blank the column (`server/src/modules/pulls/routes.ts`).

## Tool & Library Notes
_(none yet)_

## Recurring Errors & Fixes
_(none yet)_

## Session Notes
_(none yet)_

## Open Questions
_(none yet)_
