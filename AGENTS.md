# DevDigest — repo map (not docs)

Context injected every session. Keep it a **map**: stack, commands, layout, non-default conventions,
gotchas. Everything deep is a **link** below — read only when a task touches it. Keep ≤100 lines.

Local-first AI PR review. **Standalone packages, not a workspace**: each has its own `package.json` +
lockfile; cross-package code is shared via **tsconfig path aliases**, not published modules.

## Packages (each has its own AGENTS.md — read it when working there)
- [`server/`](./server/AGENTS.md) — `@devdigest/api` · Fastify + Drizzle/Postgres · `:3001`
- [`client/`](./client/AGENTS.md) — `@devdigest/web` · Next.js 15 studio · `:3000`
- [`reviewer-core/`](./reviewer-core/AGENTS.md) — `@devdigest/reviewer-core` · pure review engine
- [`e2e/`](./e2e/AGENTS.md) — `@devdigest/e2e` · deterministic agent-browser flows
- [`mcp/`](./mcp/AGENTS.md) — `@devdigest/mcp` · local stdio MCP server over the API (registered in `.mcp.json`)
- `@devdigest/shared` — Zod contracts, vendored into each package under `src/vendor/shared`
- [`evals/`](./evals/AGENTS.md) — `@devdigest/evals` · harness evals (skills, agents, workflow) · vitest + Agent SDK, CI on OpenRouter

## Toolchain
Node ≥ 22 · **pnpm** ≥ 10 (server/client) · **npm** (reviewer-core/e2e/mcp) ·
Docker (Postgres only). TypeScript 5.7 throughout.

## Commands
- `./scripts/dev.sh` — Postgres (Docker) + API `:3001` + web `:3000`, seeded.
  Flags: `--no-seed` · `--no-client` · `--db-only` · `--help`.
- `./scripts/e2e.sh` — hermetic e2e stack (alt ports), runs flows, tears down.
- Per-package `dev` / `test` / `typecheck` — see that package's AGENTS.md.
- `/pr-self-review` — **pre-PR gate**: reviews all open local changes (branch +
  working tree), routes the repo's skills onto the changed files, runs the touched
  packages' checks. A `PreToolUse` hook blocks `gh pr create` until it is green;
  deliberate override is `PR_SELF_REVIEW_BYPASS=1`. Retire a false positive with
  `pr-self-review.mjs accept "<key>" --reason "…"` — never with a habitual bypass.
- **Plan → implement (subagents in `.claude/agents/`):** optional `brainstormer`
  turns a raw idea into a Design brief → `spec-creator` analyses the designs and,
  after the user's answers, writes an EARS spec `<pkg>/specs/YYYY-MM-DD-<slug>.md`
  (cross-module: root `specs/`; template `specs/_TEMPLATE.md`; user approves) →
  `implementation-planner` reviews it, asks + the **multi-agent vs single-agent**
  choice, writes `docs/plans/<slug>.md` → user approves (both run **manually**);
  then **`/impl <plan> [notes] [designs]`** builds it: Wave 0 (main
  session) → one implementer per unit, by Kind (`implementer-backend` ·
  `implementer-ui` · `implementer` for engine/e2e/mcp) — **in parallel in the same
  checkout** (multi-agent; disjoint file ownership) or sequentially (single-agent)
  → commit per wave → `plan-verifier` (**mandatory** per wave, `scope=all` last;
  NOT MET → `mode: fix` of the owner) → ≤ 3 review rounds (`architecture-reviewer`
  ∥ bugs ∥ `security-reviewer` if touched; fixes → owning unit; re-review with
  `previous`) → `plan-verifier` re-verify → user OK → `spec-creator implemented SPEC-NN`
  (same PR) → `/pr-self-review`. `test-writer` / `doc-writer` only on demand. A
  *plan gap* (spec row no unit covers) → `implementation-planner`, new wave.
  Implementers never touch git state, deps or `INSIGHTS.md`; they check with
  `node scripts/agent-check.mjs <pkg> <files>` (typecheck + related tests).
- **Checks:** every package exposes `test` + `typecheck`; **`tsc --noEmit` is the
  lint gate** — there is no separate ESLint step, so a clean typecheck is required.
- **Harness evals** ([`evals/AGENTS.md`](./evals/AGENTS.md)) — run in `evals/`; change → run: `.claude/skills/<x>/**` →
  `pnpm eval:quality` + `pnpm vitest run skills/<x>/` · `.claude/agents/<x>.md` → `pnpm vitest run agents/<x>/` ·
  `CLAUDE.md` / `AGENTS.md` / `.claude/settings*` / hooks → `pnpm vitest run workflow/` · `evals/src/**` → `pnpm eval`.
  New suite: `pnpm eval:scaffold`. CI: `eval-skills.yml` · `eval-agents.yml` · `eval-workflow.yml` (→ `evals.yml`).

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
- [`docs/sdd-workflow.md`](./docs/sdd-workflow.md) — full spec → plan → waves → verify → PR workflow
- [`docs/`](./docs/) — repo-level docs (e.g. `agent-prompts/`)
- Per-package `docs/` · `specs/` · `INSIGHTS.md` — linked from each package's AGENTS.md
- [`specs/`](./specs/README.md) — cross-module specs only (global `SPEC-NN`, EARS) + the spec template
