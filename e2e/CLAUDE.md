# e2e — `@devdigest/e2e` (map, not docs)

Context injected every session. Keep it a **map**: stack, commands, where things
live, non-default conventions, gotchas. Everything deep is a **link** below —
Claude reads those files only when a task touches them. Keep ≤100 lines.

## Stack
Vercel **agent-browser** (native Rust + CDP) driven by `tsx`.
**No Playwright, no LLM, no API key.** `"type": "module"`.

## Commands
- `npm run e2e:hermetic` — **recommended**; isolated freshly-seeded stack on
  alt ports (PG :5433, API :3101, web :3100), then tears down. Never touches dev DB.
- `npm test` — runs flows against an already-running stack (see gotcha below)
- `npm run typecheck`
- Install once: `npm i -g agent-browser && agent-browser install`

## Where things live
- `run.ts` — the runner (executes each flow's commands in order, one session)
- `lib/assert.ts` — stdout assertion helper
- `specs/NN-name.flow.json` — the flows; each is a JSON list of agent-browser commands

## Conventions (non-default)
- A flow = ordered JSON `steps`, each `cmd` passed **verbatim** to agent-browser.
- `{BASE}` → `E2E_BASE_URL` (default `http://localhost:3000`).
- `wait --text` / `wait --url` **are** the assertions (non-zero exit fails the step).
- Deterministic locators only (`--url`, `--text`, `find role|text|label`) —
  never the AI `chat` command, so runs stay stable and key-free.

## Gotchas / do-not-touch
- Flows target **read-only seeded data** (demo repo `acme/payments-api`, PR #482).
- **Needs a freshly-seeded DB:** flows 02/04/05 assume the demo repo is the only
  one. Your dev DB usually isn't — prefer the hermetic runner.
- ⚠️ **Never `docker compose down -v`** to "reset" — `-v` wipes `devdigest_pgdata`
  (every real repo/review you imported).

## Deeper context — read the file when the task touches it (don't preload)
- [`README.md`](./README.md) — overview + how a flow works + coverage table
- [`docs/`](./docs/) — detailed design docs (runner internals, deep dives)
- [`specs/`](./specs/) — the flow specs (`NN-name.flow.json`)
- [`INSIGHTS.md`](./INSIGHTS.md) — accumulated gotchas & non-obvious learnings
- [`../TESTING.md`](../TESTING.md) — cross-package test strategy
