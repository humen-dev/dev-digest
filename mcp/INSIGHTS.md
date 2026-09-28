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
_(none yet)_

## Codebase Patterns
_(none yet)_

## Tool & Library Notes
- 2026-09-28 — Pinned `@modelcontextprotocol/sdk@1.30.1` (v1 line) with `zod@3.25.76`: the v1 SDK declares `peerDependencies.zod: "^3.25 || ^4.0"`, so zod 3 works and matches the zod-3 `@devdigest/shared` sources aliased for type-only drift checks. `registerTool(name, {title, description, inputSchema, outputSchema, annotations, _meta}, cb)` accepts a raw zod shape; server `instructions` go in the second `McpServer` constructor argument (`ServerOptions.instructions`).

## Recurring Errors & Fixes
_(none yet)_

## Session Notes
_(none yet)_

## Open Questions
_(none yet)_
