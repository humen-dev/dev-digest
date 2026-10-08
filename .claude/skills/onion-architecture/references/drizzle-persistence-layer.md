# Drizzle / Postgres — the persistence side of ring 3

Read this for repositories, row ↔ contract mapping, transactions, pgvector and migrations.
Query, relation and migration *syntax* belongs to `drizzle-orm-patterns`; table/index design to
`postgresql-table-design`.

## A repository implements a port

The port lives in the module's `ports.ts` (ring 2) and speaks in business operations and contract
types; the Drizzle class in `repository.ts` (ring 3) implements it and is the **only** place that
imports `drizzle-orm`, `db/schema`, `db/rows` or `sql`.

```ts
// ports.ts — no ORM imports
export interface PullRepository {
  listByRepo(workspaceId: string, repoId: string): Promise<PrMeta[]>;
  upsertMany(workspaceId: string, repoId: string, prs: PrMeta[], tx?: Tx): Promise<void>;
}

// repository.ts — Drizzle lives here
export class DrizzlePullRepository implements PullRepository {
  constructor(private readonly db: Db) {}
  async listByRepo(workspaceId: string, repoId: string) {
    const rows = await this.db.select().from(t.pullRequests).where(/* … */);
    return rows.map(toPrMeta); // mappers.ts
  }
}
```

Method names are **business operations** (`listOpenForRepo`, `findLatestRun`), not table operations
(`selectWhere`) — source 4.4. One repository per feature slice, **not one per table**; a repository
that spans the tables a use case touches together is fine.

Existing good shape: `modules/agents/repository.ts` — workspace-scoped, no HTTP, one owner for
`agents`, `agent_versions` and the `agent_skills` link.

## Table ownership

Every table has **one owning module** — the module whose feature the table stores. Only the owner's
repository may `insert`, `update` or `delete` its rows; that is what keeps invariants (status
transitions, cached counters, cascades the owner relies on) in one place.

| Table(s) | Owner |
|---|---|
| `repos` | `repos` |
| `pull_requests`, `pr_files`, `pr_commits` | `pulls` |
| `reviews`, `findings` | `reviews` |
| `pr_intent` · `pr_brief` | `intent` · `brief` |
| a new table | the module that introduces it (`db/schema/<module>.ts`) |

- **Reads:** a read-only join onto a foreign table inside your own repository is fine (it returns
  *your* contract). Prefer the owner's port when you need the owner's contract as is.
- **Writes:** call the owner's port (e.g. `PullsPort.setStatus(...)`), exposed through the owner's
  `index.ts`/`ports.ts` and injected via the `Container`. If the operation must be atomic with your own
  writes, the **service** opens the transaction and passes `tx` to both repositories.
- **Deciding *what* to write** (which rows to delete, which status to set) is a rule → `domain/`, not
  the repository.
- **Why a reviewer must check this:** depcruise sees only imports, and every repository legitimately
  imports `db/schema`. Grep the diff: `rg -n "\.(insert|update|delete)\(t\." server/src/modules/<m>`
  and compare each table with the owner list above.

Smell → fix: `notifications/repository.ts` runs `db.update(t.pullRequests).set({ status })` → add
`setStatus` to the `pulls` port and call it from the notifications **service**.

## Rows stay inside

| Type | Where it may appear |
|---|---|
| `typeof t.x.$inferSelect` / `AgentRow` (`db/rows.ts`) | repository and mappers only |
| `@devdigest/shared` contracts (`Agent`, `PrMeta`, `Finding`) | everywhere |
| Module-local read models (`types.ts`) | the module's rings 1–4 |

Map at the edge of the repository (`mappers.ts` beside it): `findingRowToDto`-style functions belong
here, not in `helpers.ts`, because they know the row shape. A mapper may `import type` the row
(`typeof t.notifications.$inferSelect` via `db/schema`, or `db/rows`) but must not import `drizzle-orm`
or run a query — depcruise enforces both (`orm-only-in-repositories`, `mappers-no-orm-library`). Reason: schema changes must not ripple
into services or the API (Martin 1.7, Stemmler 4.5).

Today many repositories still return rows and `db/rows.ts` is imported by services — that drift is
baselined. New code returns contracts.

## Read models that aggregate

The PR list enriches each PR with the latest score, summed cost and finding counts (see
`server/INSIGHTS.md`, 2026-09-19): one `IN (…prIds)` query per aggregate plus JS grouping. Keep that
in a **repository method that returns the assembled read model**; the service composes it, the route
returns it. Do not spread the queries over the route.

## Workspace scoping

Every query is scoped by `workspaceId`. It is a parameter of the port method, passed down from the
route's `getContext` — never read from ambient state inside the repository.

## Transactions (target pattern — none exist in the code yet)

Drizzle: `db.transaction(async (tx) => …)`; `tx` has the same query interface as `db`; nested
transactions become savepoints (source 4.1). Ownership rule (sources 4.3, 4.4, and our decision):
**the service owns the boundary**, repositories accept an optional `tx`.

```ts
// platform/transaction.ts — no ORM types; `Tx` is opaque to rings 1–2
declare const txBrand: unique symbol;
export type Tx = { readonly [txBrand]: true };
export interface TransactionRunner { run<T>(fn: (tx: Tx) => Promise<T>): Promise<T>; }

// service.ts
await this.deps.tx.run(async (tx) => {
  await this.deps.pulls.upsertMany(workspaceId, repoId, prs, tx);
  await this.deps.runs.markSynced(workspaceId, repoId, tx);
});
```

The Drizzle-backed `TransactionRunner` and the one helper that unwraps `tx ?? db` live in
`src/db/`. **Create these when the first use case genuinely needs atomic multi-writes** — do not
pre-build them.

### Transaction trace

A transaction may contain **only database work through repositories that take `tx`**. Why: the pooled
connection is held for the whole callback (a slow GitHub/LLM call starves the pool), a network call
cannot be rolled back (rollback leaves a posted comment / a sent message behind), and `JobRunner`
writes its `jobs` row with **its own connection** — a job enqueued inside a transaction can start
before the commit (reads data that is not there yet) and survives a rollback.

The offending call is rarely written inside the callback itself. Trace it:

1. **Find every boundary** in the change: `.transaction(`, `tx.run(`, any `TransactionRunner`, and every
   method that *receives* a `tx: Tx` (it runs inside someone else's transaction).
2. **List every call inside the callback** — awaited or not, including calls made through `this.<field>`,
   destructured deps, closures and callbacks passed in as arguments.
3. **Follow each call to a leaf**, file by file: private methods, module helper classes (`*.ts` next to
   the service that wrap a port), constructor-injected collaborators (resolve what the `Container` passes
   in), `domain/` functions that receive a callback. Stop when you reach:
   - a repository method called with `tx` → fine;
   - a pure function → fine;
   - a port implemented by an adapter (`GitHubClient`, `LlmClient`, `GitClient`, embedder, URL fetcher,
     filesystem), `jobs.enqueue`, an SSE/event emit, `setTimeout`/sleep, `withRetry`/`withTimeout` → **violation**.
4. **Also flag** a repository write *inside* the callback that is called **without** `tx` (it escapes the
   transaction and commits on its own), and a `withRetry` that wraps a whole transaction body containing
   any of the above.
5. **Report the chain**, not just the leaf: `ImportService.run → Enricher.enrich → LlmClient.complete`
   (`service.ts:41 → enricher.ts:18`), so the author sees where to cut.

Fix shape: **read & fetch → decide (pure) → `tx.run` with repository writes only → after commit:
network calls, `jobs.enqueue`, SSE.** When the external effect must happen exactly when the writes
commit, write an intent row inside the transaction (outbox) and let a job perform the call.

A method that fetches first and opens the transaction afterwards is the **correct** pattern — do not
flag it just because both appear in one method.

## pgvector and raw `sql`

Raw `sql` templates, vector operators and index-specific queries stay inside the repository (see
`repo-intel/repository.ts`). Ports expose intent (`nearestSymbols(repoId, embedding, k)`), never
operators.

## Adding a table

1. `src/db/schema/<name>.ts` (`workspace_id` FK to `workspaces` with `onDelete: 'cascade'`, `created_at`
   via `now()` from `_shared`); re-export it from the `db/schema.ts` barrel **and** add it to the `schema`
   object at the bottom of that file.
2. Enum-like columns: import the literal list from the module's `constants.ts` (`text('kind', { enum: KINDS })`).
   That is ring 3 depending on ring 1 — the allowed direction — and it keeps one source of truth for the
   contract and the column.
3. `pnpm db:generate --name <name>` writes `NNNN_<name>.sql` (+ meta). It only writes files; nothing
   is applied until `pnpm db:migrate`. Read the SQL before committing it.

## Migrations

`db/migrations/NNNN_name.sql` are append-only history — never edit or delete an applied one; add a
new migration. They are **not** applied on boot: `pnpm db:generate` then `pnpm db:migrate`. A new
column/table changes `db/schema/*` and the repository/mapper; it must not change a service.

## Construction

`postgres-js` connects lazily, so constructing a repository performs no I/O — keep constructors
free of it (this is why route smoke tests run without Docker).
