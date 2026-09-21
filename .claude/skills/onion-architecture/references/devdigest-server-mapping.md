# DevDigest server — mapping, drift and decisions

Read this for the real paths behind each ring, the known violations (and the order to fix them),
the decisions already settled, and what is still open. Snapshot taken 2026-09-21 on
`docs/agents-md-rename`; re-run depcruise for current numbers.

## Rings → real paths

| Ring | Paths |
|---|---|
| 1 Domain | `src/vendor/shared/**` (`@devdigest/shared`, vendored — edit at source) · `modules/*/constants.ts`, `types.ts` · `modules/pulls/status.ts` · `platform/errors.ts`, `grounding.ts` (pure) · `reviewer-core` |
| 2 Application | `modules/*/service.ts` · `modules/reviews/{run-executor,findings}.ts` (use-case code today) · infra ports in `src/vendor/shared/adapters.ts` (`LLMProvider`, `GitHubClient`, `GitClient`, `CodeIndex`, `Embedder`, `AuthProvider`, `SecretsProvider`) · `modules/repo-intel/types.ts` (`RepoIntel` facade) |
| 3 Infrastructure | `modules/*/repository.ts`, `modules/reviews/repository/*.repo.ts` · `src/db/**` · `src/adapters/**` · `platform/jobs.ts`, `sse.ts` |
| 4 Presentation & composition | `modules/*/routes.ts` · `modules/_shared/{context,schemas}.ts` · `modules/index.ts` · `app.ts` · `platform/container.ts` |

## Reference implementations — copy these

- **`modules/repo-intel/types.ts`** — a facade over several tools with a degraded contract. The best
  example of "features import this, never the libraries".
- **`src/adapters/mocks.ts`** + `ContainerOverrides` — every port has a deterministic fake and an
  injection point. This is why `routes-smoke.test.ts` runs without Docker.
- **`modules/agents/repository.ts`** — workspace-scoped, no HTTP, single owner of its tables.
- **`modules/reviews/repository/`** — repository split by aggregate (`pull.repo`, `review.repo`, `run.repo`).
- **`platform/errors.ts` + the error handler in `app.ts`** — services throw, one place maps.

## Known drift (baseline: 33 violations)

| Rule | Count | Where |
|---|---|---|
| `orm-only-in-repositories` | 15 | Routes on Drizzle: `pulls/routes.ts` (19 `db.*` calls), `settings/routes.ts`, `polling/routes.ts`, `workspace/routes.ts`. Non-repository files on the ORM/rows: `settings/feature-models.ts`, `repos/helpers.ts`, `reviews/diff-loader.ts`, `reviews/run-executor.ts`, `reviews/service.ts` (`AgentRow`) |
| `inner-not-to-container` | 9 | `agents/service.ts`, `repos/service.ts`, `reviews/{service,run-executor,diff-loader}.ts`, `repo-intel/{service.ts,pipeline/full.ts,pipeline/incremental.ts}`, `settings/feature-models.ts` |
| `no-circular` | 5 | `container ↔ repo-intel/service` (+ 2 pipeline paths through it), `agents/helpers ↔ agents/repository` |
| `adapters-not-into-modules` | 2 | `adapters/astgrep`, `adapters/depgraph` → `modules/repo-intel/constants` |
| `no-cross-module-internals` | 2 | `pulls/routes.ts` → `reviews/helpers`; `repos/service.ts` → `repo-intel/constants` |

Also outside the linter's reach: services are constructed in routes (`new AgentsService(app.container)`,
`new ReviewService(container)`) instead of coming from the container; repositories are concrete classes
with no port; the `Tokenizer` and `DepGraph` ports are declared beside their adapters.

Not yet in the code at all: `ports.ts` files, `TransactionRunner`/`Tx` (there is no
`db.transaction` call anywhere), `<name>Service` container getters.

## Suggested migration order (separate tasks — not part of this skill's change)

1. **Small routes → repository methods:** `workspace/routes.ts`, `polling/routes.ts`, `settings/routes.ts`
   (+ `settings/feature-models.ts`). Lowest risk, removes ~6 baseline entries.
2. **Move shared constants inward:** `repo-intel/constants` used by `adapters/*` and `repos/service.ts`
   → `@devdigest/shared` or a domain file. Clears 3 entries.
3. **`pulls`:** introduce `PullRepository` port + `PullService`, move the 19 queries and the GitHub sync
   out of `pulls/routes.ts`. Biggest single win; watch the read-time aggregation described in
   `server/INSIGHTS.md` (2026-09-19) — keep it in one repository method.
4. **Services off `Container`,** smallest first: `repos`, `agents`, then `reviews` (`service`,
   `run-executor`, `diff-loader`), then `repo-intel` (breaks the container cycle).
5. **Helpers that touch the schema:** `repos/helpers.ts`, `agents/helpers ↔ repository` cycle → mappers
   beside the repository.
6. Introduce `TransactionRunner` the first time a use case needs atomic multi-writes.

Each step ends with regenerating the baseline ([enforcement](enforcement.md)); it should only shrink.

## Settled decisions

| Decision | Chosen | Decided |
|---|---|---|
| Domain depth | **Pragmatic**: contracts + pure functions; no entity classes or aggregates | owner, 2026-09-21 |
| Enforcement | Skill **and** dependency-cruiser rules in CI | owner, 2026-09-21 |
| Legacy code | Rules bind new and touched code; existing drift frozen in a baseline and migrated in separate tasks | owner, 2026-09-21 |
| Repository interfaces | Application ring (`ports.ts`) | skill (sources 1.3 vs 1.1 — see README) |
| Layout | Feature slices with the onion inside; no directory renames | skill (sources 1.4, 1.5) |
| Transaction owner | The service, via a `TransactionRunner` port | skill (sources 4.3, 4.4) |
| Row types | Infrastructure-only; new code returns contracts | skill (source 1.7) |

## Open items

- **`platform/*` is unclassified.** Split into kernel (pure: `errors`, `grounding`, `prompt`) and
  infrastructure (`jobs`, `sse`, `run-logger`) so the rules can cover it; today only `container.ts` is restricted.
- **`helpers.ts`** mixes pure transforms and row mappers; needs a naming convention (`mappers.ts`) before a rule can distinguish them.
- **`db/rows.ts`** exists so modules can share a row shape without importing each other's repositories;
  decide whether contracts fully replace it.
- **Where `TransactionRunner` lives** — prefer `src/platform/transaction.ts`; `@devdigest/shared` is
  vendored into each package, so avoid it unless a second package needs the port.
- **Ports for `Tokenizer` / `DepGraph`** — move next to the consuming module's `ports.ts` when touched.
- **Route-level services** — decide whether `app.container.<name>Service` getters replace `new Service(...)` in routes everywhere.
