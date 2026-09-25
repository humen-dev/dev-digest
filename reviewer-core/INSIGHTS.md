# reviewer-core — INSIGHTS

Running log of **non-obvious** learnings the code doesn't reveal on its own:
gotchas hit while debugging, why a surprising decision was made, sharp edges to
avoid. Linked (not preloaded) from [`CLAUDE.md`](./CLAUDE.md) — read on demand.

> Not for: standard TS rules, lint-caught issues, or file-by-file description
> (Claude reads the code). One insight per bullet; newest on top. Date each
> entry so stale ones are easy to prune. Prompt/grounding subtleties belong here.

## What Works
_(none yet)_

## What Doesn't Work
_(none yet)_

## Codebase Patterns
- 2026-09-18 — Real vs estimated cost are DISTINCT fields. `StructuredResult.costUsd` is best-effort (real provider cost OR an estimate fallback); `StructuredResult.apiCostUsd` is the REAL provider cost only (OpenRouter `usage.cost`), `null` otherwise (`reviewer-core/src/llm/openrouter.ts:107`). `reviewPullRequest` sums `apiCostUsd` across chunks into `ReviewOutcome.apiCostUsd` — null until a chunk reports one (`reviewer-core/src/review/run.ts:184`). For anything money-facing persist `apiCostUsd`, never `costUsd`.

## Tool & Library Notes
- 2026-09-22 — The two vendored `shared` copies were ALREADY drifted before any edit in this session (not just theoretically at risk): `client/src/vendor/shared/contracts/knowledge.ts` was missing `AgentVersionConfig`/`AgentVersion` entirely, and `trace.ts`/`knowledge.ts` had several comment-only divergences (e.g. `CiFailOn`'s doc comment, the `T1.3`/`T3` references) that `server/`'s copy didn't have. Don't assume `diff`-and-sync is safe or that the two files were identical before your change — `diff` them first and only carry over what your task actually needs; blindly overwriting one from the other would silently drop `AgentVersion`/`AgentVersionConfig` from whichever side you copied onto.
- 2026-09-18 — `@devdigest/shared` resolves via tsconfig path alias to `../server/src/vendor/shared` (`reviewer-core/tsconfig.json`), and there are TWO canonical vendored copies (`server/src/vendor/shared` + `client/src/vendor/shared`) with NO sync script. ALWAYS apply a contract edit to BOTH copies — drift produces the `tsc` error "Two different types with this name exist, but they are unrelated".

## Recurring Errors & Fixes
_(none yet)_

## Session Notes
_(none yet)_

## Open Questions
_(none yet)_
