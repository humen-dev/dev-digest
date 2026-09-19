# server — architecture (`@devdigest/api`)

How a request becomes a persisted review. Read alongside the map in
[`../CLAUDE.md`](../CLAUDE.md); this file is the deep dive Claude reads on demand.

## Boot & composition
- `src/app.ts` `buildApp({ config, db, overrides })` builds the Fastify instance
  and wires the DI container; `src/index.ts` is the process entrypoint.
- `src/platform/config.ts` `loadConfig(env)` validates process env into a typed
  config (fail-fast on bad input).
- `src/platform/container.ts` is the **DI container**: it lazily constructs the
  adapters and shared services (db, jobs queue, `github()`, `llm`, …) and is the
  single object handlers reach through (`app.container`). Tests inject fakes via
  `overrides` instead of monkey-patching.

## Plugin order (matters)
Cross-cutting plugins (helmet, cors, rate-limit, SSE, the error handler) register
**before** feature modules so the encapsulated module plugins inherit them
(`src/app.ts`). Feature modules live in `src/modules/<name>/` and are registered
statically in `src/modules/index.ts` — each is a Fastify plugin exposing
`routes.ts` (+ a service/repository split for anything non-trivial).

## Request lifecycle
1. **Validation first.** Routes declare Zod `params`/`body`/`querystring` via
   `fastify-type-provider-zod`; invalid input is rejected with **422 before** the
   handler runs. Handlers never hand-roll `Schema.parse(req.body)`.
2. **Context.** `getContext(container, req)` resolves the active `workspaceId`
   (single-workspace local-first model) used to scope every query.
3. **Handler → repository.** Handlers call a module repository/service that talks
   to Drizzle; responses are plain DTOs typed by `@devdigest/shared` contracts.
4. **Errors.** Throw `AppError` / `NotFoundError` (`src/platform/errors.ts`); the
   global error handler maps them to status + JSON. Don't `reply.send` error bodies
   by hand.

## Adapters (ports)
`src/adapters/` holds the ports the core depends on — `llm`, `github`, `git`,
`astgrep`, `tokenizer`, `secrets`. Each has a real implementation and a fake in
`src/adapters/mocks.ts`. Secrets are read **only** through `LocalSecretsProvider`
(`~/.devdigest/secrets.json`, mode 0600) — never env/db/git.

## Data & the review engine
- Drizzle schema + migrations in `src/db/` (Postgres + pgvector). Migrations are
  **not** applied on boot — run `pnpm db:migrate`.
- The actual review is delegated to `@devdigest/reviewer-core` (imported as source
  via tsconfig path alias). The server owns persistence: `reviews` + `findings`
  rows, and `agent_runs` (denormalized run summary incl. `cost_usd`, `blockers`,
  `findings_count`). See [`../specs/cost-attribution.md`](../specs/cost-attribution.md)
  for how run cost is threaded and stored.

## Where to look
- Review persistence & DTOs: `src/modules/reviews/` (`helpers.ts` row→DTO mappers).
- PR import/list: `src/modules/pulls/routes.ts` (aggregates score, cost, findings
  per PR for the list).
- Run execution + gate: `src/modules/reviews/run-executor.ts` (`countBlockers`).
