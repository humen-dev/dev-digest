# onion-architecture

**Version 1.0.0** · created 2026-09-21 · scope: `server/` (`@devdigest/api` — Fastify 5, Drizzle + Postgres)

A skill for **backend architecture**: which ring a file belongs to (domain, application,
infrastructure, presentation), which way imports may point, and where ports, services, repositories,
routes, mappers, adapters and DI wiring live. It is enforced mechanically by dependency-cruiser rules
in CI.

`SKILL.md` is what the agent loads. This README is for humans: motivation, design decisions,
versioning and the full list of sources.

## Why this skill exists (and what it deliberately does not repeat)

`server/` already *resembles* an onion — ports in `@devdigest/shared/adapters.ts`, adapters in
`src/adapters/`, a DI `Container` with overrides, a repository per module — but nothing states the
rules, so drift accumulates (routes querying Drizzle directly, services taking the whole container).
This skill makes the architecture explicit for agents and mechanical for CI.

The repo already has skills for Fastify, Drizzle, Postgres, Zod and security. Restating them would
create two sources of truth, so this skill owns only **organization** and links out:

| Topic | Owner |
|---|---|
| Rings, import direction, where each kind of code lives, DI wiring, transaction ownership | **this skill** |
| Fastify API details | `fastify-best-practices` |
| Drizzle syntax and migrations tooling | `drizzle-orm-patterns` |
| Table and index design | `postgresql-table-design` |
| Zod technique | `zod` |
| Authz, injection, secrets | `security` |
| How this app is wired | `server/docs/architecture.md`, `server/AGENTS.md` |

## Contents

```
onion-architecture/
  SKILL.md                                   # rings, seven rules, "where does X go", module template, workflow, checklist
  README.md                                  # this file
  references/
    layers-and-dependency-rule.md            # ring contents, import matrix, borderline cases, smell → fix
    fastify-presentation-layer.md            # thin routes, plugin scope, decorators, errors, SSE
    drizzle-persistence-layer.md             # repository = port impl, rows vs contracts, transactions, migrations
    ports-and-adapters-for-tools.md          # Octokit / LLM / git / ripgrep / ast-grep / tokenizer behind ports; adapter checklist
    composition-root-and-di.md               # Container as composition root; moving services off it
    testing-by-layer.md                      # one kind of test per ring
    enforcement.md                           # depcruise rules, baseline procedure, exceptions
    devdigest-server-mapping.md              # real paths, known drift, migration order, settled decisions
```

Enforcement artifacts live outside the skill folder:

```
server/.dependency-cruiser.cjs                       # the rules
server/.dependency-cruiser-known-violations.json     # baseline: 33 pre-existing violations
.github/workflows/server-unit.yml                    # "Architecture rules" step
docs/skill-research/onion-backend-sources.md         # per-source research notes
```

Progressive disclosure: `SKILL.md` (~150 lines) loads when the skill triggers; each reference is read
only when the task needs it.

## Design decisions

Where the sources disagree the skill takes a position. Numbers refer to the sections below and to the
[research registry](../../../docs/skill-research/onion-backend-sources.md).

| Decision | Chosen | Why | Sources |
|---|---|---|---|
| Where repository interfaces live | **Application ring** (`ports.ts`) | The domain should not know about persistence; Palermo and Microsoft put them in the domain side, Graça argues for application | 1.1, 1.3, 4.6 |
| Layers first or features first | **Feature slices**, onion inside each | Matches `modules/<name>/`; slices talk through small public surfaces | 1.4, 1.5 |
| Domain depth | **Pragmatic**: contracts + pure functions, no entities/aggregates | CRUD orchestration around an LLM; the heavy logic already lives in `reviewer-core` | 1.1 (suits *complex* apps), 4.6 |
| Are repositories mandatory | Keep them — one per feature, not per table | A port is what makes services testable with fakes; the counter-argument (they hide persistence detail) assumes CQRS/aggregates we do not have | 4.4, 4.6 |
| Who opens a transaction | **The service** via a `TransactionRunner` port; repositories take optional `tx` | One use case = one boundary; a route only translates HTTP | 4.1, 4.3, 4.4 |
| What crosses a boundary | Contracts / plain data, **never rows or framework objects** | Schema and framework changes must not ripple inward | 1.7, 4.2, 4.5 |
| DI style | Constructor injection of narrow deps; **no service locator** | The signature states the dependencies; tests need no container | 1.4, 2.1 |
| Where wiring happens | The composition root only (`platform/container.ts`) | Swap implementations without touching the core | 1.1, 1.4 |
| Enforcement | dependency-cruiser **forbid** rules + baseline (`--ignore-known`) | Tolerates unclassified files; adopts on a live codebase without a big-bang refactor | 5.1, 5.5, 5.6, 5.7 |
| Type-only imports | Counted (`tsPreCompilationDeps: true`) | A leaked `import type { AgentRow }` is still a dependency on infrastructure | 5.2 |
| Legacy violations | Frozen in the baseline; migrated by separate tasks in the order given in the mapping reference | Scope discipline; the baseline only shrinks | 5.5, 5.6 |
| Tool versions | `fastify-type-provider-zod` ≤ 4.x ↔ zod v3 — upgrade together | Version coupling | 3.5 |

## Versioning

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-09-21 | First release: rules, eight references, dependency-cruiser config with a 33-entry baseline, CI step |

**Validation (2026-09-21).** Before release the skill was dry-run by building a throw-away
`notifications` module from scratch (contract → domain → port → service → table + migration → mapper →
repository → route → container wiring → tests at every ring, integration test on real Postgres in
Docker). Result: typecheck clean, all four test kinds green, and depcruise reported **no new violation**
once the run's one finding was fixed. Findings that changed the skill:

| Finding | Fix |
|---|---|
| `mappers.ts` "beside the repository" was flagged by `orm-only-in-repositories` — the rule contradicted the skill | Mappers may import row *types*; new rule `mappers-no-orm-library` still forbids the ORM |
| No home stated for module-local zod schemas; shared source is outside this repo | `types.ts`; client-visible contracts are planned with the shared package's owner |
| Workflow had no database step | Added table → barrel + `schema` object → `pnpm db:generate --name` |
| Repository-port fakes and their location unspecified | `test/helpers/<module>.ts`; documented in `testing-by-layer.md` |
| No override key for a service's repository port | `<name>Repo` key in `ContainerOverrides` |
| "DB-free" route tests silently needed Docker | They also need `auth: new MockAuthProvider()` |

Bump the minor version when a rule or the ring map changes; the patch version for wording.
When a baselined violation is fixed, regenerate the baseline (see `references/enforcement.md`).

## Sources

Legend: ✅ opened and read while building the skill. Per-source notes ("what we take") are in the
[research registry](../../../docs/skill-research/onion-backend-sources.md).

### 1. Principles — Onion, Hexagonal, Clean
- 1.1 ✅ [Jeffrey Palermo — The Onion Architecture, part 1 (2008)](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/)
- 1.2 ✅ [Jeffrey Palermo — The Onion Architecture, part 2](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/)
- 1.3 ✅ [Herberto Graça — Onion Architecture](https://herbertograca.com/2017/09/21/onion-architecture/)
- 1.4 ✅ [Herberto Graça — Explicit Architecture: DDD, Hexagonal, Onion, Clean, CQRS…](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/)
- 1.5 ✅ [Oliver Drotbohm — Sliced Onion Architecture](http://odrotbohm.github.io/2023/07/sliced-onion-architecture/)
- 1.6 ✅ [Alistair Cockburn — Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture)
- 1.7 ✅ [Robert C. Martin — The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- 1.8 ✅ [Wikipedia — Hexagonal architecture](https://en.wikipedia.org/wiki/Hexagonal_architecture_(software))
- 1.9 ✅ [Javi — DDD and the Onion Architecture](https://blog.itsjavi.com/target-software-architectures-the-onion-architecture)

### 2. Onion in TypeScript / Node
- 2.1 ✅ [André Bazaglia — Clean architecture with TypeScript: DDD, Onion](https://bazaglia.com/clean-architecture-with-typescript-ddd-onion/)

### 3. Fastify
- 3.1 ✅ [The hitchhiker's guide to plugins](https://fastify.dev/docs/latest/Guides/Plugins-Guide/)
- 3.2 ✅ [Encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/)
- 3.3 ✅ [Decorators](https://fastify.dev/docs/latest/Reference/Decorators/)
- 3.4 ✅ [Plugins](https://fastify.dev/docs/latest/Reference/Plugins/)
- 3.5 ✅ [`fastify-type-provider-zod`](https://github.com/turkerdev/fastify-type-provider-zod)

### 4. Persistence — repositories, mappers, transactions
- 4.1 ✅ [Drizzle — Transactions](https://orm.drizzle.team/docs/transactions)
- 4.2 ✅ [Drizzle — Goodies (type inference)](https://orm.drizzle.team/docs/goodies)
- 4.3 ✅ [Sentry — Atomic Repositories in Clean Architecture and TypeScript](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/)
- 4.4 ✅ [Paul Serban — Drizzle ORM Best Practices](https://blog.paulserban.eu/post/drizzle-orm-best-practices-principles-patterns-and-real-world-case-studies/)
- 4.5 ✅ [Khalil Stemmler — DTOs, Mappers & the Repository Pattern](https://khalilstemmler.com/articles/typescript-domain-driven-design/repository-dto-mapper/)
- 4.6 ✅ [Microsoft Learn — Designing the infrastructure persistence layer](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-design)

### 5. Enforcement — dependency-cruiser
- 5.1 ✅ [Rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md)
- 5.2 ✅ [Options reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/options-reference.md)
- 5.3 ✅ [CLI](https://github.com/sverweij/dependency-cruiser/blob/main/doc/cli.md)
- 5.5 ✅ [Xebia — Taking Frontend Architecture Serious With Dependency-cruiser](https://xebia.com/blog/taking-frontend-architecture-serious-with-dependency-cruiser/)
- 5.6 ✅ [lastminute.com — How We Enforce Architecture Boundaries at Scale](https://technology.lastminute.com/how-we-enforce-architecture-boundaries-at-scale-on-our-app/)
- 5.7 ✅ [Atomic Object — Dependency Cruiser: Restrict Imports](https://spin.atomicobject.com/dependency-cruiser-imports/)

Not cited (could not be verified): the dependency-cruiser rules tutorial (5.4, not opened), the Wolk
Software InversifyJS article (2.2, page body did not load) and one Medium article (2.3, HTTP 403).
