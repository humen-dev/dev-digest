# mcp — `@devdigest/mcp` (map, not docs)

Context injected every session. Keep it a **map**: stack, commands, where things
live, non-default conventions, gotchas. Everything deep is a **link** below —
Claude reads those files only when a task touches them. Keep ≤100 lines.

## Stack
Local **stdio** MCP server: a thin HTTP client over the running DevDigest API
(`:3001`). `@modelcontextprotocol/sdk@^1`, `zod@^3.25`, a `tsx` launcher (no
build step). **npm**, standalone package (not a pnpm workspace member).

## Commands
- `npm test` — vitest, hermetic (fake API / stub `fetch`; no keys, no network
  except a refused connection to a closed port in the smoke test)
- `npm run typecheck` — the only compile step; the package never emits JS
- `npm start` — run the server directly (`node bin/devdigest-mcp.mjs`)

## Where things live (rings, onion-architecture at package scale)
- Ring 1 (domain, pure — imports only ring 1 + `zod`): `domain/types.ts`
  (`Api*` shapes + compact result shapes), `domain/tool-definitions.ts` (names,
  schemas, frozen descriptions), `format/*` (pure mappers), `errors.ts`, `config.ts`.
- Ring 2 (use cases + port): `ports.ts` (`DevDigestApi`), `tools/types.ts`
  (`ToolContext`/`ToolHandler`), `tools/<tool>.ts`, `resolve.ts`, `wait.ts`.
- Ring 3 (adapter): `api/http-client.ts` (the only file calling `fetch`),
  `api/schemas.ts` (zod parsing + type-only drift check against
  `@devdigest/shared`).
- Ring 4 (protocol + composition): `server.ts` (the only file importing the
  SDK), `index.ts` (composition root: builds `HttpDevDigestApi`, wires
  handlers), `bin/devdigest-mcp.mjs` (launcher).

## Conventions (non-default)
- **stdout is protocol-only.** `bin/devdigest-mcp.mjs` redirects
  `console.log`/`console.info` to stderr before loading any module (static ESM
  imports would run first); all logging goes to stderr.
- Tools depend only on the `DevDigestApi` **port**, never on `fetch` or the SDK
  directly — enforced by `src/architecture.test.ts`.
- Tool descriptions ≤300 chars, key info first (tool search reads names +
  descriptions before anything else); no `outputSchema`; `TOOL_ORDER` is a
  stable, tested registration order.
- Every failure is a `ToolError{code, message, next}` — `next` always names a
  concrete next step for the calling agent.
- `@devdigest/shared` is consumed **type-only** (`api/schemas.ts`), aliased like
  `reviewer-core/tsconfig.json` — never imported at runtime.

## Gotchas / do-not-touch
- The DevDigest API must be running (`./scripts/dev.sh`) for the tools to do
  anything useful; the server itself starts fine with the API down (no startup
  I/O) and reports `api_unreachable` on the first call.
- `DEVDIGEST_API_URL` defaults to `http://127.0.0.1:3001`, not `localhost` —
  the API binds IPv4 `0.0.0.0`, and `localhost` can resolve to `::1` first on
  some Node/Windows setups.
- After changing tool schemas/descriptions/handlers, **restart the MCP server**
  in the client (`claude` caches the `tools/list` result for the session).
- `get_blast_radius` reads `GET /pulls/:id/blast`; its input contract `{repo, pr}`
  stays frozen.
- `run_agent_on_pr`'s default wait budget is 55 s (`DEVDIGEST_MCP_WAIT_MS`
  overrides it, clamped 5 000–600 000 ms) — see `mcp/README.md` for how to raise
  it together with the calling client's own tool timeout.

## Deeper context — read the file when the task touches it (don't preload)
- [`README.md`](./README.md) — the 5 tools, `.mcp.json` snippet, env vars
- [`INSIGHTS.md`](./INSIGHTS.md) — accumulated gotchas & non-obvious learnings
- [`docs/plans/devdigest-mcp.md`](../docs/plans/devdigest-mcp.md) — the design plan (contracts, decisions)
- [`../TESTING.md`](../TESTING.md) — cross-package test strategy
