# server — `@devdigest/api` (map, not docs)

Context injected every session. Keep it a **map**: stack, commands, where things
live, non-default conventions, gotchas. Everything deep is a **link** below —
Claude reads those files only when a task touches them. Keep ≤100 lines.

## Stack
Fastify 5 · Drizzle ORM 0.38 · `postgres` + pgvector · zod (via
`fastify-type-provider-zod`) · fastify-sse-v2 · tsx · vitest 2 + testcontainers.
Package manager: **pnpm**. `"type": "module"`.

## Commands
- `pnpm dev` — API on `:3001` (tsx watch)
- `pnpm db:migrate` · `pnpm db:seed` · `pnpm db:generate`
- Tests: unit `pnpm exec vitest run --exclude '**/*.it.test.ts'` ·
  integration `pnpm exec vitest run .it.test` · `pnpm test` runs both
- `pnpm typecheck`

## Where things live
- `src/modules/<name>/` — feature plugins (`routes.ts` + service). Registered
  statically in `src/modules/index.ts`. `repo-intel` lives here too.
- `src/adapters/` — ports (llm · github · git · astgrep · tokenizer · secrets);
  test doubles in `src/adapters/mocks.ts`.
- `src/platform/` — `config.ts` (loadConfig), `container.ts` (DI).
- `src/db/` — Drizzle schema + migrations. `src/prompts/`. `src/vendor/shared`.

## Conventions (non-default)
- **Schema-first validation:** routes declare zod `params`/`body`; invalid input
  → 422 before the handler. Don't hand-roll `Schema.parse(req.body)`.
- Plugins (helmet/cors/rate-limit/SSE + error handler) register **before**
  modules so encapsulated module plugins inherit them.

## Gotchas / do-not-touch
- **Migrations are NOT applied on boot** — run `pnpm db:migrate` (pgvector via `0000`).
- Secrets live in `~/.devdigest/secrets.json` (mode 0600), read only through
  `LocalSecretsProvider` — never env/db/git. `GITHUB_TOKEN` canonical, `GITHUB_PAT` fallback.
- A DB-backed test (imports `test/helpers/pg.ts`) **must** use `*.it.test.ts`.
- `INJECTION_GUARD` + grounding gate are security-critical — see reviewer-core.
- `src/vendor/shared` is vendored — edit at source, not here.

## Deeper context — read the file when the task touches it (don't preload)
- [`README.md`](./README.md) — overview + request/DI + API-map diagrams
- [`docs/`](./docs/) — deep dives, e.g. [`architecture.md`](./docs/architecture.md)
- [`specs/`](./specs/) — behavior specs, e.g. [`review-flow.md`](./specs/review-flow.md) · [`cost-attribution.md`](./specs/cost-attribution.md)
- [`INSIGHTS.md`](./INSIGHTS.md) — accumulated gotchas & non-obvious learnings
- [`../TESTING.md`](../TESTING.md) — cross-package test strategy
