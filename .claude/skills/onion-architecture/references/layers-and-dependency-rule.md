# Layers and the dependency rule

Read this when you are unsure which ring a file belongs to, or whether an import is allowed.

## The rule

Source dependencies point **inward only**. Code in an inner ring must not mention the name
of anything declared in an outer ring — not a class, a type, a function or a constant
(Palermo, Martin: sources 1.1, 1.7 in the [registry](../../../../docs/skill-research/onion-backend-sources.md)).
Type-only imports count: `import type { AgentRow }` is still a dependency on the
infrastructure ring, and the depcruise config is set up to see it (`tsPreCompilationDeps: true`).

When an inner ring needs something an outer ring provides, it declares a **port** (an
interface it owns) and the outer ring implements it. Control flow goes outward at runtime;
source dependencies still point inward.

## What each ring may contain

| Ring | May contain | Must not contain |
|---|---|---|
| **1 Domain** | Zod contracts and inferred types, pure functions, constants, discriminated unions, small value helpers | `fastify`, `drizzle-orm`, `postgres`, any vendor SDK, `fs`/network, `process.env`, `Container`, rows |
| **2 Application** | Use-case classes/functions, port interfaces, orchestration, transaction boundary, `AppError` throws | HTTP objects, SQL, `db/schema`, `db/rows`, SDK types, `new Adapter()` |
| **3 Infrastructure** | Drizzle repositories, mappers, SDK adapters, job runner, SSE bus, file/process access | Business decisions, HTTP concerns, imports from `routes.ts` |
| **4 Presentation & composition** | Fastify plugins, zod route schemas, `getContext`, the DI container, app bootstrap | SQL, business rules, direct `new` of repositories in a route |

## Allowed imports

Rows = the importing ring, columns = what it may import. "own" = the same module; other modules
only through `index.ts`, `ports.ts`, `types.ts`.

| Importer ↓ / imports → | 1 Domain | 2 Application | 3 Infrastructure | 4 Presentation |
|---|---|---|---|---|
| **1 Domain** | ✅ | ❌ | ❌ | ❌ |
| **2 Application** | ✅ | ✅ own | ❌ (ports only) | ❌ |
| **3 Infrastructure** | ✅ | ✅ (implements ports) | ✅ own | ❌ |
| **4 Presentation** | ✅ | ✅ | ❌ (reached via the container) | ✅ own |
| **Composition root** (`container.ts`, `app.ts`) | ✅ | ✅ | ✅ | ✅ |

Outer rings may skip intermediate rings (a route may use a contract directly). Inner rings
never reach outward.

## Borderline cases

| Case | Decision |
|---|---|
| `platform/errors.ts` (`AppError`, `NotFoundError`, …) | Shared kernel: pure, so rings 1–2 may import it. |
| Other `platform/*` files | Mixed (`jobs.ts`, `sse.ts` are infrastructure; `grounding.ts`, `prompt.ts` are pure). Not yet classified — do not import `platform/container.ts` from rings 1–2; treat the rest case by case. |
| `zod` | Allowed in ring 1: it is a schema library with no I/O. |
| `graphology`, `graphology-metrics` | Pure computation (used in `repo-intel/pipeline/rank.ts`); allowed wherever the caller is. |
| `@devdigest/reviewer-core` | The domain engine, consumed as source. Ring-1 dependency. Its `OpenRouterProvider` is an adapter that the container instantiates. |
| `helpers.ts` | If it only transforms contracts/plain data → ring 1 in spirit. If it maps a **row** or imports `db/schema` → it is a mapper: move it beside the repository. |
| Row types (`db/rows.ts`) | Infrastructure. They were introduced to avoid importing another module's repository; the onion answer is a contract type instead. Existing uses are baselined; add none. |
| `Logger` | Depend on a small `Logger` interface (see `run-executor.ts`), not on Fastify's `app.log` type. |
| Clock, IDs, randomness | Inject when a test needs determinism; otherwise call directly — do not add ceremony. |

## Smell → fix

| You see | Do this |
|---|---|
| `container.db.select()…` in a route | Add a repository method behind a port; the route calls a service. |
| `await container.github()` inside a service | Inject `github: () => Promise<GitHubClient>` in the service deps. |
| Service signature `(container: Container)` | Replace with a `<Name>Deps` interface — see [composition-root-and-di](composition-root-and-di.md). |
| Service imports `AgentRow` | Repository returns a contract type; map the row in `mappers.ts`. |
| Helper imports `db/schema` | It is a mapper or query — move to the repository. |
| Adapter imports a module's `constants.ts` | Move the constant to `@devdigest/shared` or a domain file both can import. |
| Container ↔ service import cycle | The service takes deps; only the container constructs it. |
| Route imports another module's `helpers.ts` | Promote the function to a contract-level helper or call that module's service via the container. |

## Why this shape

The point is not the diagram. It is that the code that decides things can be run and tested
without Fastify, Postgres or the network, and that swapping an SDK or a table touches one ring.
Palermo frames it as suited to long-lived, complex applications — for a tiny CRUD route it is
fine to keep the ceremony proportionate: a port for a repository with one caller is still worth it
here because the service must be testable with a fake.
