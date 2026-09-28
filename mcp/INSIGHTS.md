# mcp — INSIGHTS

Running log of **non-obvious** learnings the code doesn't reveal on its own:
gotchas hit while debugging, why a surprising decision was made, sharp edges to
avoid. Linked (not preloaded) from [`CLAUDE.md`](./CLAUDE.md) — read on demand.

> Not for: standard TS rules, lint-caught issues, or file-by-file description
> (Claude reads the code). One insight per bullet; newest on top. Date each
> entry so stale ones are easy to prune.

## What Works
_(none yet)_

## What Doesn't Work
- 2026-09-28 — (supersedes the "timeout must not say retry" entry below) A timeout is not the only "maybe delivered" failure: undici throws the same `TypeError('fetch failed')` for a refused connection AND for a socket reset after a POST body was written (e.g. `tsx watch` restarts the API mid-request). Only `err.cause.code` tells them apart. ALWAYS treat a failed POST as possibly processed unless the code proves it never left (`ECONNREFUSED`/`ENOTFOUND`/`EAI_AGAIN`) — `maybeProcessed()` in `mcp/src/api/http-client.ts`, flag `ApiUnreachableError.maybeProcessed` (`mcp/src/errors.ts`).
- 2026-09-28 — NEVER write invisible/bidi characters into test sources as `\uXXXX` through an agent edit tool: the escape gets decoded, so the file ends up containing the literal hidden characters (a Trojan-Source pattern that editors may silently strip, turning the test vacuous). Build such inputs from code points instead — `[0x200b, 0x202e, 0x2066, 0xfeff].map((cp) => String.fromCodePoint(cp))` (`mcp/src/format/text.test.ts`) — and check with `/\p{Cf}/u` that the source has none left.
- 2026-09-28 — NEVER map a request TIMEOUT to the same "API not reachable, start it and retry" message as a refused connection: for the paid, non-idempotent `POST /pulls/:id/review` the server may already have created the run, so "retry" makes the agent start a duplicate LLM review. `ApiUnreachableError.timedOut` (`mcp/src/errors.ts`) is set from `isTimeoutLike` in `mcp/src/api/http-client.ts`, and `toErrorPayload` then points the agent at `get_findings` first.
- 2026-09-28 — A `console.log = console.error` redirect as the "first statement" of an ESM entry (`mcp/src/index.ts`) does NOT run first: static `import`s are evaluated before the module body, so any top-level stdout write in a dependency would still corrupt the stdio JSON-RPC stream. ALWAYS redirect in the launcher and load everything after it with dynamic `import()` (`mcp/bin/devdigest-mcp.mjs`); the smoke test guards it via `client.onerror` (`mcp/src/index.smoke.test.ts`).
- 2026-09-28 — The test `makeCtx` sleep (`mcp/test/fake-api.ts`) always resolves, but the real `ToolContext.sleep` REJECTS when the client cancels mid-pause (`mcp/src/server.ts:40,49`). Code that only checks `ctx.signal.aborted` between polls therefore passes every fake-clock test yet turns a user cancel into an "Internal error" in production. ALWAYS wrap `ctx.sleep` so an abort-caused rejection maps to the aborted outcome (`mcp/src/wait.ts:66`), and test it with a `sleep` override that aborts and throws.

## Codebase Patterns
- 2026-09-28 — `PrMeta.id` is `nullish` in the shared contract (`server/src/vendor/shared/contracts/platform.ts:159`), so `GET /repos/:id/pulls` may return a PR row that cannot be addressed by `/pulls/:id/...`. NEVER default it to `''` (that silently builds `/pulls//review`); drop such rows at the adapter boundary — `ApiPullListSchema` in `mcp/src/api/schemas.ts` filters them, and the tool then reports `pr_not_found` with an onward hint.
- 2026-09-28 — A new package is invisible to the agent tooling until it is registered in EVERY hard-coded package list, and one of them is easy to miss: besides `pr-self-review` (`checks.mjs` `PACKAGES`, `rules.mjs` `pkgOf`, `routing.json`), `capture-insights.mjs` `MODULES`, `write-scope-guard.mjs` and the engineering-insights SKILL table, `plan-verifier`/`test-writer` can only `cd` into dirs matched by `CD_DIR` in `.claude/hooks/bash-scope-guard.mjs:17` — without it every mandatory plan-verifier run returns INCOMPLETE ("may not run \"cd mcp\""). ALWAYS extend all of them (and their `*.test.mjs`) together. Also: `pr-self-review.mjs` has no `--help`/dry-run — invoking it runs a full review.

## Tool & Library Notes
- 2026-09-28 — The MCP SDK client consumes `notifications/progress` itself: `client.fallbackNotificationHandler` NEVER sees them, so a test that watches it for a stray progress message is vacuous (it passed with the server mutated to always send progress). A progress notification for a call that passed no token is reported through `client.onerror` ("Received a progress notification for an unknown token", `@modelcontextprotocol/sdk/dist/esm/shared/protocol.js` `_onprogress`) — assert on that (`mcp/src/server.test.ts`).
- 2026-09-28 — NEVER alias `"zod/*"` in `mcp/tsconfig.json` `paths` (only the bare `"zod"`): the wildcard hijacks the MCP SDK's own `zod/v3` / `zod/v4/core` subpath imports (`@modelcontextprotocol/sdk/dist/esm/server/zod-compat.d.ts`) and resolves them to zod's ESM `.d.ts` while our bare `zod` import resolves to the CJS `.d.cts` chain — two nominally unrelated `ZodNumber`/`ZodEffects` classes. Every `registerTool` call with a non-empty schema then fails `TS2589 excessively deep` / `TS2322 not assignable to AnySchema`, and `tsc` spins for minutes before erroring (looks like a hang). With the line removed `npm run typecheck` finishes in ~5 s. Related: a generic `registerOne<N extends ToolName>` wrapper over the tool-name union also blows up TS2589, so `mcp/src/server.ts` registers each tool with a literal name in a `switch` driven by `TOOL_ORDER`.
- 2026-09-28 — zod 3 `ZodType<T>` pins `Input = Output = T`, so a generic `parse<T>(schema: ZodType<T>)` over a schema with `.transform()`/`.nullish()` makes TS infer `T` from the PRE-transform input shape (e.g. `id?: string | null` instead of `id: string`). Type the parameter by output only — `type OutputSchema<T> = ZodType<T, ZodTypeDef, unknown>` (`mcp/src/api/http-client.ts:24`, used at `:108`).
- 2026-09-28 — Pinned `@modelcontextprotocol/sdk@1.30.1` (v1 line) with `zod@3.25.76`: the v1 SDK declares `peerDependencies.zod: "^3.25 || ^4.0"`, so zod 3 works and matches the zod-3 `@devdigest/shared` sources aliased for type-only drift checks. `registerTool(name, {title, description, inputSchema, outputSchema, annotations, _meta}, cb)` accepts a raw zod shape; server `instructions` go in the second `McpServer` constructor argument (`ServerOptions.instructions`).

## Recurring Errors & Fixes
_(none yet)_

## Session Notes
_(none yet)_

## Open Questions
_(none yet)_
