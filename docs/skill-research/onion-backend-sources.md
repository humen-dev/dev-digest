# Onion architecture for the backend — source registry

Research date: 2026-09-21. This is the working research log behind the
[`onion-architecture`](../../.claude/skills/onion-architecture/SKILL.md) skill (v1.0.0). The
skill's [README](../../.claude/skills/onion-architecture/README.md#sources) holds the canonical,
published source list; this file keeps the per-source notes ("what we take"). Section numbers are
shared between the two. Format follows [`react-frontend-sources.md`](./react-frontend-sources.md).

**Status legend**
- ✅ **Opened and read** (WebFetch) — content verified.
- 🔎 **Search results only** — the page exists but was not opened; re-read before relying on it.
- ⚠️ **Could not be opened** — not cited by the skill.

**Levels:** **A** official documentation · **B** recognised authors / methodologies ·
**C** secondary / contextual material.

---

## 1. Principles — Onion, Hexagonal, Clean

| # | Source | Level | Status | What we take |
|---|---|---|---|---|
| 1.1 | [Jeffrey Palermo — The Onion Architecture, part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/) | B | ✅ | The original (2008). Domain model at the centre; code may depend on inner layers, never outer ones; the database is **external infrastructure**, not the centre; the core depends on interfaces, implementations live at the edge and are injected at runtime. Aimed at long-lived, complex business apps — not small sites. |
| 1.2 | [Palermo — part 2](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/) | B | ✅ | Worked example: a controller depends on repository/session *interfaces*; the interface contracts sit in the application core and the implementations in outer layers. |
| 1.3 | [Herberto Graça — Onion Architecture](https://herbertograca.com/2017/09/21/onion-architecture/) | B | ✅ | Layers: Domain Model → Domain Services → Application Services → Infrastructure/UI/Tests. Outer layers may skip intermediate layers. **Disagrees with Palermo:** repository interfaces belong in the *application* layer so the domain stays ignorant of persistence. (Mirror: [Medium](https://medium.com/the-software-architecture-chronicles/onion-architecture-79529d127f85).) |
| 1.4 | [Herberto Graça — Explicit Architecture (DDD, Hexagonal, Onion, Clean, CQRS)](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/) | B | ✅ | **Package by component** (feature), layers inside; ports live inside the application core and describe the *conversation*, not the tool's API; primary (driving) vs secondary (driven) adapters; wire adapters to ports at the composition root by constructor injection; components talk via events / a shared kernel, not by reaching into each other. |
| 1.5 | [Oliver Drotbohm — Sliced Onion Architecture](http://odrotbohm.github.io/2023/07/sliced-onion-architecture/) | B | ✅ | Cuts the onion into vertical **slices** (each with domain, application, infrastructure) so several feature areas coexist; slices interact through exposed APIs or events, not direct coupling. Matches our `modules/<name>/` layout. |
| 1.6 | [Alistair Cockburn — Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture) | B | ✅ | Ports & adapters: a technology-specific adapter converts an external event into a call the application understands; intent = the app can be driven by users, tests or batch scripts and developed in isolation from real databases and devices. |
| 1.7 | [Robert C. Martin — The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) | B | ✅ | The Dependency Rule: source dependencies point only inward. Across a boundary pass simple data structures / DTOs — **not database rows or framework objects**. Basis for "rows never leave the repository". |
| 1.8 | [Wikipedia — Hexagonal architecture](https://en.wikipedia.org/wiki/Hexagonal_architecture_(software)) | C | ✅ | Onion (2008) and Clean (2012) both grew out of hexagonal; onion adds concentric rings with inversion of control. Useful for naming the lineage only. |
| 1.9 | [Javi — DDD and the Onion Architecture](https://blog.itsjavi.com/target-software-architectures-the-onion-architecture) | C | ✅ | Restates the four-ring model (Domain, Application, Presentation, Infrastructure) and the "outer may use inner, never the reverse" rule. |

## 2. Onion in TypeScript / Node

| # | Source | Level | Status | What we take |
|---|---|---|---|---|
| 2.1 | [André Bazaglia — Clean architecture with TypeScript: DDD, Onion](https://bazaglia.com/clean-architecture-with-typescript-ddd-onion/) | C | ✅ | Four directories `domain / app / infra / api`; in TS "inversion of control means injecting things as parameters instead of importing them". We take the idea, not the InversifyJS dependency. |
| 2.2 | [Wolk Software — SOLID and the onion architecture in Node.js with TypeScript and InversifyJS](https://www.wolksoftware.com/blog/implementing-solid-and-the-onion-architecture-in-node-js-with-typescript-and-inversifyjs) | C | 🔎 | Seen in search results (the old `blog.` host redirects here; the page body did not load). Same DI theme. Not cited by the skill. |
| 2.3 | Sankhadip Samanta — *Onion Architecture in Node.js with TypeScript* (Medium) | C | ⚠️ | HTTP 403. Not cited. |

## 3. Fastify — presentation ring and composition

| # | Source | Level | Status | What we take |
|---|---|---|---|---|
| 3.1 | [Fastify — The hitchhiker's guide to plugins](https://fastify.dev/docs/latest/Guides/Plugins-Guide/) | A | ✅ | `register` creates a new encapsulated context; decorators are visible to children, not siblings/parents; use `fastify-plugin` to share across the boundary; bootstrap async resources (DB) in a `register` callback. |
| 3.2 | [Fastify — Encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/) | A | ✅ | Contexts form a hierarchy; parents cannot see child decorators; wrap with `fastify-plugin` to lift them. Why our cross-cutting plugins register **before** modules. |
| 3.3 | [Fastify — Decorators](https://fastify.dev/docs/latest/Reference/Decorators/) | A | ✅ | Decorators attach to server/request/reply; decorating request/reply with **reference types is blocked** (shared mutable state across requests). Per-request state comes from an `onRequest` hook, not a decorated object. |
| 3.4 | [Fastify — Plugins](https://fastify.dev/docs/latest/Reference/Plugins/) | A | ✅ | `register(plugin, opts)`; async plugin contract (async function, no `done`). Our modules are exactly this: `export default async function xRoutes(app)`. |
| 3.5 | [`fastify-type-provider-zod`](https://github.com/turkerdev/fastify-type-provider-zod) | A | ✅ | `setValidatorCompiler` + `setSerializerCompiler` + `withTypeProvider<ZodTypeProvider>()`. **Version coupling:** ≤4.x ↔ zod v3, ≥5 ↔ zod v4. The repo is on `^4.0.2` + `zod ^3.24` → upgrade together. |

## 4. Persistence — repositories, mappers, transactions (Drizzle)

| # | Source | Level | Status | What we take |
|---|---|---|---|---|
| 4.1 | [Drizzle — Transactions](https://orm.drizzle.team/docs/transactions) | A | ✅ | `db.transaction(async (tx) => …)`: all-or-nothing, `tx.rollback()`, nested transactions become savepoints; `tx` exposes the same query interface as `db`. |
| 4.2 | [Drizzle — Goodies (type inference)](https://orm.drizzle.team/docs/goodies) | A | ✅ | `$inferSelect` / `$inferInsert` / `InferSelectModel`. These are **row types** → they stay in the infrastructure ring (`db/rows.ts`); services and routes use `@devdigest/shared` contracts. |
| 4.3 | [Sentry — Atomic Repositories in Clean Architecture and TypeScript](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/) | B | ✅ | Transaction abstraction defined in the application layer without ORM imports; ORM-specific type only in infrastructure; repositories take an optional transaction (`tx ?? db`). Their example opens the transaction in the controller — we deliberately move it to the service (see README decisions). |
| 4.4 | [Paul Serban — Drizzle ORM Best Practices](https://blog.paulserban.eu/post/drizzle-orm-best-practices-principles-patterns-and-real-world-case-studies/) | C | ✅ | Repository methods express business operations, not table operations; **the service layer owns the transaction boundary**, repositories accept an optional db/tx so they are reusable inside or outside a transaction. |
| 4.5 | [Khalil Stemmler — DTOs, Mappers & the Repository Pattern](https://khalilstemmler.com/articles/typescript-domain-driven-design/repository-dto-mapper/) | B | ✅ | Repository = facade over persistence; DTOs = data contracts to clients; mappers translate between ORM model, domain and DTO so schema changes don't break the API. |
| 4.6 | [Microsoft Learn — Designing the infrastructure persistence layer](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-design) | A | ✅ | Repository interfaces are defined in the domain/application side, implemented in infrastructure; repositories make application logic unit-testable with fakes; **repositories are optional** (a dissenting Jimmy Bogard quote argues they hide persistence detail) — the source of our "pragmatic, no repository-per-table ceremony" stance. |

## 5. Enforcement — dependency-cruiser

| # | Source | Level | Status | What we take |
|---|---|---|---|---|
| 5.1 | [dependency-cruiser — rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md) | A | ✅ | `forbidden` rules with `from`/`to`, `path`/`pathNot`, `$1` group matching inside `to.pathNot` (basis of `no-cross-module-internals`), `circular: true`, `dependencyTypes`. |
| 5.2 | [dependency-cruiser — options reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/options-reference.md) | A | ✅ | `tsPreCompilationDeps` defaults to **false**, which hides type-only imports — we set it `true` so a leaked `import type { AgentRow }` is still caught. `tsConfig`, `doNotFollow`, `exclude`. |
| 5.3 | [dependency-cruiser — CLI](https://github.com/sverweij/dependency-cruiser/blob/main/doc/cli.md) | A | ✅ | `--ignore-known` + a known-violations file. **Version note:** the docs on `main` deprecate `depcruise-baseline` in favour of `--baseline`, but the installed `17.4.3` only has `depcruise-baseline` (verified with `--help`). |
| 5.4 | [dependency-cruiser — rules tutorial](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-tutorial.md) | A | 🔎 | Step-by-step rule writing. Not opened. |
| 5.5 | [Xebia — Taking Frontend Architecture Serious With Dependency-cruiser](https://xebia.com/blog/taking-frontend-architecture-serious-with-dependency-cruiser/) | C | ✅ | Rules as an "architecture fitness function"; roll out **incrementally** on existing codebases before strict CI enforcement. |
| 5.6 | [lastminute.com — How We Enforce Architecture Boundaries at Scale](https://technology.lastminute.com/how-we-enforce-architecture-boundaries-at-scale-on-our-app/) | C | ✅ | Fail builds on violations; opt-in, gradual adoption so ongoing work isn't blocked. Same rationale as our baseline. |
| 5.7 | [Atomic Object — Dependency Cruiser: Restrict Imports](https://spin.atomicobject.com/dependency-cruiser-imports/) | C | ✅ | "Forbid" (block specific dangerous dependencies) vs "allow" (only pre-approved imports) rule styles. We use forbid rules — they tolerate the rings we haven't classified yet. |

---

## Where the sources disagree — and the position the skill takes

| Question | Positions | Skill's position |
|---|---|---|
| Where do repository interfaces live? | Palermo (1.1), Microsoft (4.6): domain side. Graça (1.3): application layer. | **Application layer**, in the module's `ports.ts`. The domain (contracts + pure functions) never mentions persistence. |
| Layers first or features first? | Classic onion: layers first. Graça (1.4), Drotbohm (1.5): package by component. | **Feature slices** (`modules/<name>/`), onion *inside* each slice — matches the repo. |
| Who opens the transaction? | Sentry (4.3): controller. Serban (4.4): service. | **The service** — one use case = one transactional boundary; a route only translates HTTP. |
| Are repositories mandatory? | Microsoft (4.6) quotes the counter-view: they can hide persistence. | Keep them: this codebase has no CQRS/aggregates, and a port is what makes services testable with `adapters/mocks.ts`-style fakes. One repository per *feature*, not per table. |
| Rich domain model? | DDD-flavoured sources: entities/aggregates. | **Pragmatic**: domain = `@devdigest/shared` contracts + pure functions. No entity classes (decided with the owner; the heavy domain logic already lives in `reviewer-core`). |
