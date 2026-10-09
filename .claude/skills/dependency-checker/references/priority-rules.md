# Priority rubric

One scale for every finding and every action-plan row. The collector assigns a
default priority per rule; the agent may move a finding **one level** with a written
reason (e.g. "P2 → P1: the drifting `zod` copies validate the same vendored contracts").

| Priority | Meaning | Act |
|---|---|---|
| **P0** | Exploitable or breaking now: critical/high vulnerability reachable from production, production install that cannot start | Before the next release |
| **P1** | Correctness or security risk that will bite: unused/misplaced prod deps, deprecated packages, shared-contract libraries split across versions, no lockfile | This sprint |
| **P2** | Cost: install size, duplicates in the prod tree, stray `node_modules`, dev tooling in `dependencies`, minor drift of shared libs | Planned cleanup |
| **P3** | Hygiene: loose specifiers, `@types` in prod, dev-only duplicates, outdated majors with no advisory | Opportunistic |

## Rule → default priority

| Rule | Default | Raised when | Lowered when |
|---|---|---|---|
| `vulnerability` | critical → P0 · high in prod → P0 · high in dev → P1 · moderate → P2 · low → P3 | — | Vulnerable code path verified unreachable (state why) |
| `deprecated` | P1 | Has a known advisory | Replacement is a rename with identical API |
| `no-lockfile` | P1 | Package is deployed | — |
| `possibly-unused` (prod) | P1 | — | Verified false positive → drop |
| `possibly-unused` (dev) | P2 | — | Also installed transitively (removing changes nothing on disk) → P3 |
| `dev-used-in-prod` | P1 | Package is deployed with a prod-only install (server, mcp) | Next.js client — build bundles devDeps anyway → P2 |
| `duplicate-versions` | shared-contract lib → P1 · prod tree → P2 · dev only → P3 | Two copies of a library whose instances are compared (`instanceof`, Zod schemas) | Platform binary of a build tool |
| `version-drift` | major: shared lib P1 / other P2 · minor: shared P2 / other P3 | — | Only `@types/*` patch drift |
| `stray-install` | P2 | — | — |
| `stale-install` | P2 | — | — |
| `heavy-prod-dep` | P2 | Server-side cold start or Docker image size matters | Big on disk but tree-shaken in the browser bundle → P3 |
| `tooling-in-prod` | P2 | — | Used at runtime (verified) → drop |
| `multiple-lockfiles`, `not-installed` | P2 | — | — |
| `types-in-prod`, `loose-specifier`, `outdated-major`, `alias-pins-node_modules` | P3 | `outdated-major` with an EOL/security note | — |

## Ordering inside a priority

Sort by **impact ÷ effort**, using these labels in the action plan:

- **Impact:** `high` (security, breakage, ≥ 50 MB, shared contracts) · `med` (5–50 MB, one package's correctness) · `low` (hygiene).
- **Effort:** `S` (one command, no code change) · `M` (code change in one package, tests) · `L` (migration across packages or API changes).

Group rows that share one command (e.g. three `pnpm remove` in one package) into a single row.
