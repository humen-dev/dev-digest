# Phase 2 — mechanical checks

Implemented in [`../scripts/checks.mjs`](../scripts/checks.mjs). Every command is
the one `.github/workflows/*.yml` actually runs, so a green gate means the same
thing CI will mean.

## The matrix

A package is "touched" when the change set contains a **non-Markdown** file under
it: a docs edit inside `server/` must not trigger a build.

| Trigger | cwd | Command | Timeout |
|---|---|---|---|
| `client/**` code | `client/` | `pnpm typecheck` | 180s |
| `client/**` code | `client/` | `pnpm test` | 300s |
| `server/**` code | `server/` | `pnpm typecheck` | 180s |
| `server/**` code | `server/` | `pnpm exec vitest run --exclude **/*.it.test.ts` | 300s |
| `server/src/**` | `server/` | `pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known` | 120s |
| `reviewer-core/**` code | `reviewer-core/` | `npm run typecheck`, `npm test` | 120s / 180s |
| `e2e/**` code | `e2e/` | `npm run typecheck` **only** | 120s |

### Fan-out

`reviewer-core/src/**` or `**/src/vendor/shared/**` additionally triggers the
`server` **and** `client` typechecks. Cross-package tsconfig path aliases consume
`reviewer-core` **as source**, never as built JS, so an engine change breaks its
consumers' typecheck without touching a file in them.

### What is deliberately never run

- **`server` integration tests** (`*.it.test.ts`) — testcontainers Postgres. Too
  slow and Docker-dependent for a gate. CI covers them in `server-integration.yml`.
  This is why the unit command is the inlined `vitest run --exclude`, not
  `pnpm test` (which runs both).
- **`e2e` `npm test`** (`tsx run.ts`) — needs a live Docker + API + web stack.
  DET-014 tells the author to run `./scripts/e2e.sh` instead.

### Why the commands are inlined

`server/package.json` has no `arch:check` or `test:unit` script, and
`.github/workflows/server-unit.yml` inlines them for the same reason. Inlining
also means the gate and CI cannot drift apart through a local package.json edit.

> The workflow comment attributes this to `server/package.json` being
> `skip-worktree`. That is stale — `git ls-files -v server/package.json` reports
> `H` in this clone. Inlining is still right, for reproducibility.

## Spawning

- `shell: false` with an **argv array**, always. `--exclude '**/*.it.test.ts'` as a
  single quoted string is a PowerShell landmine — the quotes survive into the
  argument and vitest matches nothing.
- `pnpm.cmd` / `npm.cmd` on `win32`, plain names elsewhere.
- `env: { CI: '1', FORCE_COLOR: '0' }` so the output parses deterministically.
- A **timeout or a spawn failure is CRITICAL**, never a pass. A check that did not
  finish has not passed.

## Failure → finding

| Tool | Parsed from | Produces |
|---|---|---|
| `tsc` | `path(line,col): error TSxxxx: message` | One CRITICAL per error at the exact `file:line`, `category: 'bug'`, id `MECH-TSC-<pkg>-<n>`. Capped at 20 + a rollup finding for the remainder |
| `vitest` | `FAIL <file> > <case>` / `× <file> > <case>` | One CRITICAL per failing **file** (not per case), `start_line: 1`, `category: 'test'`, listing up to 5 case names |
| `depcruise` | `error <rule>: <from> -> <to>` | One CRITICAL per violation, id `MECH-ARCH-<n>`, suggestion citing the rule and `onion-architecture/references/enforcement.md` |

A non-zero exit whose output does not parse still produces one CRITICAL carrying
the last 40 non-blank lines of output — a check may never fail silently.

## Adding a check

Add a `push({...})` in `planChecks` with its trigger, `cwd`, argv, timeout and a
`parse` key. If the tool's output needs a new parser, add it to `PARSERS`; if you
skip that, failures still surface through the raw-output fallback, just without
`file:line` precision.
