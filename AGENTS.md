# DevDigest — repo map (not docs)

Context injected every session. Keep it a **map**: stack, commands, layout,
non-default conventions, gotchas. Everything deep is a **link** below — Claude
reads those files only when a task touches them. Keep ≤100 lines.

Local-first AI PR review. **Standalone packages, not a workspace**: each has its
own `package.json` + lockfile; cross-package code is shared via **tsconfig path
aliases**, not published modules. Each package has its own `AGENTS.md`.

## Packages (each has its own AGENTS.md — read it when working there)
- [`server/`](./server/AGENTS.md) — `@devdigest/api` · Fastify + Drizzle/Postgres · `:3001`
- [`client/`](./client/AGENTS.md) — `@devdigest/web` · Next.js 15 studio · `:3000`
- [`reviewer-core/`](./reviewer-core/AGENTS.md) — `@devdigest/reviewer-core` · pure review engine
- [`e2e/`](./e2e/AGENTS.md) — `@devdigest/e2e` · deterministic agent-browser flows
- `@devdigest/shared` — Zod contracts, vendored into each package under `src/vendor/shared`

## Toolchain
Node ≥ 22 · **pnpm** ≥ 10 (server/client) · **npm** (reviewer-core/e2e) ·
Docker (Postgres only). TypeScript 5.7 throughout.

## Commands
- `./scripts/dev.sh` — Postgres (Docker) + API `:3001` + web `:3000`, seeded.
  Flags: `--no-seed` · `--no-client` · `--db-only` · `--help`.
- `./scripts/e2e.sh` — hermetic e2e stack (alt ports), runs flows, tears down.
- Per-package `dev` / `test` / `typecheck` — see that package's AGENTS.md.
- **Checks:** every package exposes `test` + `typecheck`; **`tsc --noEmit` is the
  lint gate** — there is no separate ESLint step, so a clean typecheck is required.

## Conventions (non-default)
- Cross-package imports resolve through **tsconfig path aliases** to `src` —
  `reviewer-core` is consumed as **source**, never as built JS.
- `@devdigest/shared` is **vendored** into each package (`src/vendor/shared`) —
  edit at the source, not the copies.
- Only **Postgres** runs in Docker; API and web run on the host.
- Agent instructions live in **`AGENTS.md`**; each `CLAUDE.md` is only a stub
  (`@AGENTS.md`) for Claude Code — edit `AGENTS.md`, never the stub.

## Naming conventions
- **Files/dirs:** feature UI in `_components/<PascalCase>/` with an `index.ts`
  barrel; colocated tests `*.test.ts(x)`; colocated styles `styles.ts`.
- **Code:** React components & Zod contracts `PascalCase`; hooks `useX`;
  values/functions `camelCase`; module-level constants `UPPER_SNAKE`.
- **Server:** one plugin per `src/modules/<kebab>/` (`routes.ts` + service).
- **DB:** Drizzle tables/columns `snake_case`; migrations `NNNN_name.sql` (ordered).
- **i18n:** `messages/<locale>/<namespace>.json`. **e2e flows:** `specs/NN-name.flow.json`.

## Gotchas / do-not-touch
- **Migrations are NOT applied on boot** — `cd server && pnpm db:migrate` (pgvector via `0000`).
  Migrations under `server/src/db/migrations/` are **append-only history — never
  edit or delete an applied `NNNN_*.sql`**; change the schema with a new migration.
- **Do not hand-edit or delete lockfiles** (`pnpm-lock.yaml` / `package-lock.json`) —
  each package pins its own; change deps only via the package manager (`pnpm`/`npm`).
- ⚠️ **Never `docker compose down -v`** — `-v` wipes `devdigest_pgdata` (all imported repos/reviews).
- This branch is the **course starter** — homework/features live in forks, not `main`.

## Session Protocol (engineering-insights)
- **Start:** before writing code, read the `INSIGHTS.md` of the module(s) this
  task touches (`client/` · `server/` · `reviewer-core/` · `e2e/`); treat entries
  as high-confidence guidance.
- **During:** when a non-obvious learning surfaces, capture it with the
  `engineering-insights` skill.
- **End:** only if the session produced something substantial and not already
  recorded, run `/engineering-insights`; re-read first to avoid duplicates.
  **Append-only — never rewrite existing entries.**

## Deeper context — read the file when the task touches it (don't preload)
- [`README.md`](./README.md) — full overview + architecture diagram + quick start
- [`TESTING.md`](./TESTING.md) — cross-package test strategy & CI workflows
- [`docs/`](./docs/) — repo-level docs (e.g. `agent-prompts/`)
- Per-package `docs/` · `specs/` · `INSIGHTS.md` — linked from each package's AGENTS.md
