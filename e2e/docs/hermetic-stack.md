# e2e — hermetic stack & runner (`@devdigest/e2e`)

How the deterministic browser flows run. Read alongside the map in
[`../AGENTS.md`](../AGENTS.md).

## The runner (`run.ts`)
- Executes one flow — an ordered JSON list of **agent-browser** commands — in a
  single browser session, each `cmd` passed **verbatim** to agent-browser.
- No Playwright, no LLM, no API key. Vercel agent-browser (native Rust + CDP)
  driven by `tsx`.
- `lib/assert.ts` provides the stdout assertion helper; a non-zero exit on any step
  fails the flow.

## Hermetic mode (recommended)
- `npm run e2e:hermetic` (or repo-root `./scripts/e2e.sh`) spins up a **fresh,
  freshly-seeded** stack on **alternate ports** so it never touches your dev DB:
  - Postgres `:5433`, API `:3101`, web `:3100`.
- It seeds, runs the flows against that isolated stack, then tears everything down.
- `npm test` runs flows against an **already-running** stack instead — only safe
  when that stack is freshly seeded (see below).

## Determinism rules
- **Deterministic locators only**: `--url`, `--text`, `find role|text|label`. Never
  the AI `chat` command — runs must stay stable and key-free.
- `wait --text` / `wait --url` **are** the assertions.
- `{BASE}` in a flow resolves to `E2E_BASE_URL` (default `http://localhost:3000`;
  `:3100` under the hermetic runner).

## Gotchas
- Flows target **read-only seeded data** — the demo repo `acme/payments-api`,
  PR #482. Flows `02/04/05` assume the demo repo is the only one, so a polluted dev
  DB breaks them → prefer the hermetic runner.
- ⚠️ Never `docker compose down -v` to "reset" — `-v` wipes `devdigest_pgdata`.

See [`../specs/flows.md`](../specs/flows.md) for the flow-file contract.
