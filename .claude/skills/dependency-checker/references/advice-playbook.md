# Advice playbook

Rule → remedy → command shape. Commands are **recommendations for the developer**;
the skill never runs them. Use the package's own manager:

| Manager | Packages | Remove | Move to dev | Explain why installed | Run a script | Clean reinstall |
|---|---|---|---|---|---|---|
| pnpm | server, client, evals | `pnpm remove <dep>` | `pnpm remove <dep> && pnpm add -D <dep>@<range>` | `pnpm why <dep>` | `pnpm run <script>` | `rm -rf node_modules && pnpm install --frozen-lockfile` |
| npm | reviewer-core, e2e, mcp | `npm uninstall <dep>` | `npm install -D <dep>@<range>` | `npm ls <dep>` / `npm explain <dep>` | `npm run <script>` | `rm -rf node_modules && npm ci` |

Always prefix with `cd <pkg> &&` — there is no workspace root to run from. **Every** command for a
package uses its manager, including scripts, builds and audits: `cd client && pnpm run build`, never
`npm run build` in a pnpm package. Before writing the plan, list each package's manager from §4 and
check every command against it.

## Per rule

**`vulnerability`** — Prefer the patched version within the same major
(`pnpm update <dep>` / `npm update <dep>`). If only transitive: upgrade the direct
parent; as a last resort `pnpm.overrides` / npm `overrides` in that package's
`package.json`, with a comment-linked advisory and a removal condition. A
semver-major fix is effort `M`/`L` — say what API changes.

**`deprecated`** — Name the replacement the deprecation message gives; if none, say so
and keep it P1 with "find alternative".

**`possibly-unused`** — State what was searched. Then decide, in this order:

1. **Declared on purpose?** Some packages are declared explicitly although nothing imports
   them: peers that a plugin expects the app to own (`postcss` for `@tailwindcss/postcss` /
   any PostCSS plugin, `react-dom` for React libraries, `typescript` for `tsc`), and runtime
   plugins loaded by name from config. If so → **false positive**, list it in §10, keep it.
2. **Also installed transitively** (`also installed transitively via X`) and not a peer of
   anything → removing it shrinks nothing on disk; the win is only a truthful manifest.
   Recommend removal as P3 hygiene, after checking the parent's range still covers the usage.
3. **Truly unused** → remove in one commit, then run the package's `typecheck` + `test`.

A finding with `also installed transitively via <framework>` (e.g. `via next`) is almost
always case 1 — verify before planning removal.

**`dev-used-in-prod`** — Move to `dependencies` (server/mcp/reviewer-core) **or**
stop importing it from runtime code (better when it is a test/seed helper).

**`tooling-in-prod`** — Move to `devDependencies`. Quote the exclusive size from the
finding as the production-install saving.

**`heavy-prod-dep`** — Separate **install cost** (Docker image, CI cache, cold
install) from **bundle cost** (what users download). For client deps, suggest
`next build` + bundle analyzer to measure the bundle before replacing anything;
suggest lazy loading (`next/dynamic`) for rarely used heavy UI (diagrams, charts).
For server deps, suggest lighter alternatives only when the closure is ≥ 2× a known
alternative — and name it.

**`duplicate-versions`** — Find the parents (`pnpm why` / `npm ls`). Fix by aligning
the parents' ranges; dedupe (`pnpm dedupe` / `npm dedupe`) only reorganizes within
existing ranges. For Zod or React duplicates in the prod tree, explain the
`instanceof` / context-identity risk.

**`version-drift`** — Propose one target version per shared library across all
packages (the highest installed one unless it breaks), and the per-package commands.
For `zod`: the vendored `@devdigest/shared` contracts are compiled against each
package's own copy, so drift = contracts behaving differently per package.

**`stray-install`** — Leftovers of a different package manager (`.pnpm`,
`.ignored_*` in an npm package). Clean reinstall with the correct manager; nothing
to commit. Quote the reclaimed size.

**`stale-install`** — node_modules does not match package.json; clean reinstall
before trusting any other number in the report.

**`types-in-prod` / `loose-specifier` / `outdated-major`** — Batch into one hygiene
row per package.

**`alias-pins-node_modules`** — Not a bug; a sign the package needed to force one
copy of a library. Keep its version aligned with the package that owns the vendored
code (server) — link to the matching `version-drift` row if any.

## Recommendations section (§12) — groups

1. **Security** — audit cadence (CI step per package), override policy.
2. **Size & performance** — biggest prod closures, lazy loading, Docker image notes.
3. **Consistency across packages** — single versions for `zod`, `typescript`,
   `@types/node`, `tsx`, `vitest`; one manager per package.
4. **Hygiene & process** — rerun this skill before releases; keep snapshots
   committed so §13 shows trends; extend `categories.json` for "Other" deps.

Each bullet must point at something in this report (a section, a finding ID or a
number). Generic advice with no evidence does not belong in the report.
