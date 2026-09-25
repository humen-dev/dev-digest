# Testing by layer

Read this to pick the right kind of test for the code you wrote. Technique for React tests lives in
`react-testing-library`; this is the server side. Cross-package strategy: [`TESTING.md`](../../../../TESTING.md).

## One kind of test per ring

| Ring | What you test | How | File / CI job |
|---|---|---|---|
| **1 Domain** | Pure functions: status derivation, grounding, diff parsing, mappers over plain data | Plain unit tests, no mocks, table-driven | `test/*.test.ts` — `server-unit` |
| **2 Application** | A service's decisions and orchestration | Construct the service with **fake ports** (`src/adapters/mocks.ts` + in-memory repository fakes). No DB, no Fastify | `test/*.test.ts` — `server-unit` |
| **3 Infrastructure — repositories** | Real SQL against real Postgres (pgvector) | testcontainers via `test/helpers/pg.ts` | **must** be `*.it.test.ts` — `server-integration` |
| **3 Infrastructure — adapters** | Contract of one adapter (parsing, error mapping) with a fake transport | Unit test around the adapter; the mock must satisfy the same port | `test/adapters.test.ts` |
| **4 Presentation** | Route wiring: schema → 422, error envelope, status codes | `buildApp({ config, overrides })` + `app.inject()`; DB-free when the route does not hit the DB | `test/routes-smoke.test.ts` pattern |
| **Architecture** | Dependency direction | `depcruise --ignore-known` | `server-unit` typecheck job |

Existing anchors: `pulls-status.test.ts`, `grounding.test.ts`, `reviews-helpers.test.ts` (ring 1);
`routes-smoke.test.ts` (ring 4); `reviews.it.test.ts`, `pulls-comments.it.test.ts` (ring 3).

## Where the fakes live

- **Adapter fakes** (LLM, GitHub, git, …) → `src/adapters/mocks.ts`, next to the real adapters.
- **Repository-port fakes** (an in-memory `NotificationRepository`) are test code → `test/helpers/<module>.ts`.
  They must be workspace-scoped like the real repository, so a service test also proves tenancy is passed through.
- **Route tests without a DB** need two overrides, not one: the repository port (`<name>Repo`) **and**
  `auth: new MockAuthProvider()`. `getContext()` calls the `AuthProvider`, and the default
  `LocalNoAuthProvider` reads the default workspace from Postgres. Forgetting the auth override is the
  usual reason a "DB-free" route test suddenly needs Docker.

## Rules

- **Fake the port, not the vendor.** Inject `MockGitHubClient`, not a stubbed Octokit. You own the port;
  you do not own the SDK, and a stub of it tests your guess about it.
- **A service test that needs a `Container` or `buildApp` is a smell** — it means the service is a
  service locator ([composition-root-and-di](composition-root-and-di.md)). Fix the constructor, not the test.
- **A DB-backed test imports `test/helpers/pg.ts` and is named `*.it.test.ts`** (AGENTS.md gotcha —
  otherwise the unit job tries to run it without Docker).
- **Mocks satisfy the real port.** `MockLLMProvider implements LLMProvider`; if the port changes the
  mock stops compiling, which is the point.
- **Do not test the wrong ring.** Business rules through `app.inject()` are slow and hide the failure
  location; keep them in ring 1–2 tests and use `inject` only for the HTTP contract.
- **Determinism:** mock LLMs return caller-supplied fixtures; no network in unit or route tests.
- New repository method → integration test. New pure rule → unit test next to the existing ones. New
  route → a smoke test that at least covers validation (422) and one happy path.

## Commands

```bash
cd server
pnpm exec vitest run --exclude '**/*.it.test.ts'   # unit (ring 1, 2, 4, adapters)
pnpm exec vitest run .it.test                        # integration (needs Docker)
pnpm typecheck
pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known
```
