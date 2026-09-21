---
name: onion-architecture
description: "Onion-architecture rules for the Fastify/Drizzle backend (server/): which ring a file belongs to (domain, application, infrastructure, presentation), which way imports may point, and where ports, services, repositories, routes, mappers, adapters and DI wiring live; enforced in CI by dependency-cruiser. Use whenever creating, moving, splitting or reviewing backend code — a new src/modules/<name>, a route that queries the database, a service that keeps growing, 'where should this live', adding an SDK/adapter/port, wiring the Container, transactions, or a structure-focused PR review — even if the user never says 'architecture' or 'onion'. Not for Fastify API usage (fastify-best-practices), Drizzle query syntax (drizzle-orm-patterns), table design (postgresql-table-design), schemas (zod), or vulnerabilities (security)."
metadata:
  version: "1.0.0"
---

# Onion Architecture (backend)

How `server/` (`@devdigest/api`: Fastify 5, Drizzle + Postgres) is **organized**: which
ring each file belongs to, which way dependencies point, and where each kind of code
lives. Principles are general; paths are this repo's.

Version 1.0.0 — sources, rationale and history are in [README.md](README.md).

## Scope — what this skill owns, and what it leaves to others

Link instead of restating rules another skill owns; two copies drift apart.

| Question | Owner |
|---|---|
| Which ring does this file belong to? What may it import? Where do ports / services / repositories / routes / adapters live? Who wires them? Who owns the transaction? | **this skill** |
| Fastify API: hooks, plugin options, serialization, logging, deployment | `fastify-best-practices` |
| Drizzle query / relation / migration syntax | `drizzle-orm-patterns` |
| Table and index design | `postgresql-table-design` |
| Zod schema technique | `zod` |
| Authz, injection, secrets handling | `security` |
| Type-level TypeScript | `typescript-expert` |
| How this app is wired end to end | [`server/docs/architecture.md`](../../../server/docs/architecture.md), [`server/AGENTS.md`](../../../server/AGENTS.md) |

Precedence when guidance conflicts: `server/AGENTS.md` > this skill > generic advice.

## The four rings

Dependencies point **inward only**. The inner ring never names anything from an outer one.

| Ring | What it is | Files in this repo |
|---|---|---|
| **1 Domain** | Vocabulary and pure rules. No I/O, no framework. | `@devdigest/shared` contracts (`src/vendor/shared`) · `modules/<m>/domain/` · `constants.ts` · `types.ts` · `reviewer-core` |
| **2 Application** | Use cases and the ports they need. | `modules/<m>/service.ts` · `modules/<m>/ports.ts` · infra ports in `@devdigest/shared/adapters.ts` |
| **3 Infrastructure** | Implements ports with real tools. | `modules/<m>/repository.ts` (Drizzle) · `src/db/**` · `src/adapters/**` (Octokit, OpenAI, Anthropic, simple-git, ast-grep, ripgrep, tiktoken) · `platform/jobs.ts`, `sse.ts` |
| **4 Presentation & composition** | HTTP in, wiring. | `modules/<m>/routes.ts` · `app.ts` · `platform/container.ts` · `modules/index.ts` |

Test for any file: *could it run without Fastify, Postgres and the network?* Yes → rings 1–2.
No → ring 3 or 4, and something inner must own the interface it implements or calls.

## The seven rules

1. **Dependencies point inward only** (4 and 3 → 2 → 1). Reversal is done with a port.
2. **The core owns its ports; adapters implement them.** A port describes the *conversation the
   use case needs* (`listOpenPulls`), not the tool's API (`octokit.rest.pulls.list`).
3. **Framework, ORM and SDK types stop at their ring.** `FastifyRequest`, Drizzle rows/`sql`, and
   vendor SDK types never enter rings 1–2. Cross a boundary with plain data or a `@devdigest/shared` contract.
4. **A service receives narrow dependencies through its constructor** — the ports it uses — not the
   whole `Container` (that is a service locator: it hides what the use case depends on).
5. **Each layer does one job.** Routes: HTTP ↔ plain arguments. Services: orchestrate, decide, own the
   transaction. Repositories: SQL and row ↔ contract mapping. Domain functions: pure rules.
6. **Wire in the composition root only.** `new SomeAdapter()` / `new SomeRepository(db)` appear in
   `platform/container.ts` (and tests), nowhere else.
7. **A module's public surface is small.** Other modules may import only `index.ts`, `ports.ts`,
   `types.ts`. Slice by feature, layer *inside* each slice (sliced onion).

## Where does X go?

| You have… | It goes in… |
|---|---|
| Route path, zod `params`/`body`, status code | `routes.ts` (thin: schema → `getContext` → service → contract) |
| Multi-step operation, a decision, calls to several ports | `service.ts` |
| Repository interface | `ports.ts` (application ring) |
| Drizzle query, `sql`, `db/schema`, row ↔ contract mapping | `repository.ts` (+ `mappers.ts` beside it); returns **contract types, never rows** |
| Pure rule (derive status, score, group, parse) | `domain/<purpose>.ts` — no I/O, unit-tested alone |
| Literals, option lists | `constants.ts` |
| Zod schema / type used only by this module (request body, query, response shape) | `types.ts` — zod is allowed in ring 1; derive types with `z.infer` |
| Contract the **client** also needs | `@devdigest/shared` — edit at source, never the vendored copy. The source is **not in this repo**, so plan that change with the shared package's owner; until it lands keep the schema in `types.ts` |
| New table / column | `db/schema/<name>.ts` + barrel export + entry in the `schema` object (`db/schema.ts`) + `pnpm db:generate --name <name>` → new `NNNN_name.sql`; never edit an applied migration |
| External system (GitHub, LLM, git, ripgrep, AST, tokenizer) | port → adapter in `src/adapters/<tool>/` → fake in `adapters/mocks.ts` → wired in `Container` |
| Secret or token | `SecretsProvider` only — never env/db/git |
| Background work | handler registered on `container.jobs` from the service; payload type in `types.ts` |
| Workspace/tenant scope | `getContext()` in the **route**; pass `workspaceId` to the service as a plain argument |
| Failure | throw `AppError` / `NotFoundError` from the service; the global handler maps it |
| Atomic multi-write | the **service** opens the transaction (see [drizzle-persistence-layer](references/drizzle-persistence-layer.md)) |
| Test | per ring — [testing-by-layer](references/testing-by-layer.md) |

Details: [layers-and-dependency-rule](references/layers-and-dependency-rule.md),
[ports-and-adapters-for-tools](references/ports-and-adapters-for-tools.md).

## Module template

```
modules/<name>/
  routes.ts        # 4  Fastify plugin; the only file that knows HTTP
  service.ts       # 2  use cases; constructor(deps: <Name>Deps)
  ports.ts         # 2  <Name>Repository + any port only this module needs
  repository.ts    # 3  Drizzle implementation of the ports
  mappers.ts       # 3  row → contract; may import row TYPES, not the ORM
  domain/          # 1  optional: pure rules
  constants.ts     # 1
  types.ts         # 1  module-local zod schemas + inferred types, payloads
  index.ts         # public facade for OTHER modules, only if they need one
```

Create files on demand. Same names as today's modules (`routes.ts` + service + repository) — this
skill adds `ports.ts` and `domain/`, it renames nothing.

## Workflow

**New module** — `constants.ts` + `types.ts` (zod contracts) → `domain/` rules → `ports.ts` →
`service.ts` (constructor deps) → table in `db/schema/` + `pnpm db:generate --name <module>` →
`mappers.ts` + `repository.ts` → `routes.ts` → register in `modules/index.ts` → wire in `Container`
(getter + a `<name>Repo` override key) → tests per ring → depcruise (below).

**Touching an existing module** — do not make it worse and do not grow the baseline. Fix the
violations in the code you are changing when it is cheap (move the query into the repository;
pass a narrow dep instead of `Container`); otherwise leave a one-line note. Do **not** start a
module-wide refactor inside an unrelated change. Known drift and migration order:
[devdigest-server-mapping](references/devdigest-server-mapping.md).

**Reviewing** — read top to bottom and ask the checklist; report each violation with the target
location ("move this query to `PullRepository.listByRepo`"), not just "wrong layer".

## Enforcement

Rules live in `server/.dependency-cruiser.cjs`; existing drift is frozen in
`server/.dependency-cruiser-known-violations.json`. A new violation fails CI.

```bash
cd server && pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known
```

When you fix a baselined violation, regenerate the baseline so it shrinks. Never add a violation to
the baseline to make CI pass. See [enforcement](references/enforcement.md).

## Checklist

- [ ] `routes.ts` has no Drizzle, no SQL, no business rule; it calls a service.
- [ ] Service takes narrow deps (ports), not `Container`; no `FastifyRequest` inside.
- [ ] Nothing outside `repository*` imports `drizzle-orm`, `db/schema` or `db/rows` (only
      `mappers.ts` may import row **types**, never the ORM).
- [ ] Repositories return contract types; rows do not escape.
- [ ] New external tool sits behind a port + adapter + mock; its SDK is imported only in `src/adapters/`.
- [ ] Adapters are constructed only in `platform/container.ts` (and tests).
- [ ] No import of another module's routes/service/helpers/constants/repository.
- [ ] Multi-write use case has one transaction opened by the service.
- [ ] Depcruise passes; the baseline did not grow.
- [ ] Tests exist at the right ring (pure / mocks / `*.it.test.ts` / `app.inject`).

## Reference index — read only what the task needs

| File | Read it when |
|---|---|
| [references/layers-and-dependency-rule.md](references/layers-and-dependency-rule.md) | Deciding a file's ring; the import matrix; borderline cases |
| [references/fastify-presentation-layer.md](references/fastify-presentation-layer.md) | Writing or slimming a `routes.ts`; plugin scope, decorators, error mapping, SSE |
| [references/drizzle-persistence-layer.md](references/drizzle-persistence-layer.md) | Repositories, row ↔ contract mapping, transactions, pgvector, migrations |
| [references/ports-and-adapters-for-tools.md](references/ports-and-adapters-for-tools.md) | Adding or replacing Octokit / LLM / git / ast-grep / ripgrep / tokenizer / job queue |
| [references/composition-root-and-di.md](references/composition-root-and-di.md) | Replacing `Container` params, container getters, overrides |
| [references/testing-by-layer.md](references/testing-by-layer.md) | Choosing the right kind of test for the code you wrote |
| [references/enforcement.md](references/enforcement.md) | A rule fired; updating the baseline; adding a rule or an exception |
| [references/devdigest-server-mapping.md](references/devdigest-server-mapping.md) | Real paths, known drift, settled decisions, open items |
