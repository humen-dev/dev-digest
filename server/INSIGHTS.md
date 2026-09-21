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
- 2026-09-21 — A route test that only overrides the repository port is NOT DB-free: `getContext()` calls `container.auth.currentWorkspace(req)` (`server/src/modules/_shared/context.ts:20`) and the default auth is `new LocalNoAuthProvider(db)` (`server/src/platform/container.ts:84`), which reads the default workspace from Postgres — so the test silently needs Docker/a DB. ALWAYS also pass `overrides: { auth: new MockAuthProvider() }` (`server/src/adapters/mocks.ts:314`) when testing a route without a DB.

## Codebase Patterns
- 2026-09-19 — The PR list (`GET /repos/:id/pulls`) enriches each `PrMeta` with fields computed on READ (no denormalization): latest-review `score`, `cost_usd`, and `findings` — each a single `IN (...prIds)` query + JS grouping (`server/src/modules/pulls/routes.ts:114-190`). `findings` aggregates across **all** `kind='review'` reviews of a PR (matches the detail page), mapped to the `Finding` contract via `findingRowToDto` (`server/src/modules/reviews/helpers.ts:34`). **SUPERSEDES the 2026-09-18 cost note below:** PR-list `cost_usd` is now the **SUM** of every priced run for the PR (its total spend), not the latest priced run (`server/src/modules/pulls/routes.ts:132-155`).
- 2026-09-18 — Only OpenRouter reports a REAL per-call USD cost (`usage.cost`); the `openai`/`anthropic` adapters always return `estimateCost(...)` (`server/src/adapters/llm/openai.ts:84`). Persist real cost only: `run-executor` writes `ReviewOutcome.apiCostUsd` into `agent_runs.cost_usd` (null for openai/anthropic/unpriced runs), never the estimate (`server/src/modules/reviews/run-executor.ts`). PR-list COST is the latest run whose `cost_usd` is non-null, so a just-failed newest run doesn't blank the column (`server/src/modules/pulls/routes.ts`).

## Tool & Library Notes
- 2026-09-21 — **QUALIFIES the pnpm-path entry below:** the resolved path of an npm package differs by environment (Windows dev: `node_modules/.pnpm/drizzle-orm@0.38.4_postgres@3.4.9/node_modules/drizzle-orm/index.d.ts`; Linux CI: `node_modules/drizzle-orm/index.d.ts`), and the depcruise baseline is keyed on the resolved `to` path — so 5 baselined `drizzle-orm` entries looked "new" in CI and failed `server unit` while passing locally. ALWAYS keep `preserveSymlinks: true` (`server/.dependency-cruiser.cjs:174`) so paths are `node_modules/<pkg>/…` everywhere, and verify a baseline change on CI, not only on your machine.
- 2026-09-21 — dependency-cruiser resolves pnpm packages to `node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>/…`, so a rule written as `^node_modules/drizzle-orm` NEVER matches and fails silently (a dead rule that reports green). Match npm packages with `(^|/)node_modules/<pkg>(/|$)` — the `npm()` helper in `server/.dependency-cruiser.cjs:20`. ALWAYS prove a new rule with a throw-away probe file that violates it before trusting a green run.
- 2026-09-21 — `server/package.json` is `skip-worktree` in this repo (the workflows already say so: `.github/workflows/server-unit.yml:104`), so a script added to it (e.g. an `arch:check`) is NOT committed and CI never sees it. NEVER rely on new package scripts for CI; call the tool inline like the architecture step does (`.github/workflows/server-unit.yml:72-73`, `pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known`).

## Recurring Errors & Fixes
- 2026-09-18 — Deriving a parent dir with `full.lastIndexOf('/')` breaks on Windows: `path.join` normalizes separators to `\`, so there is no `/` → `slash = -1` → `mkdir` skipped → `writeFile` fails ENOENT (6 tests). ALWAYS use `dirname()` for the parent dir, never a hardcoded `/` scan (`server/test/indexer-pipeline.test.ts:140`).

## Session Notes
_(none yet)_

## Open Questions
_(none yet)_
