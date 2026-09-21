# Enforcement — dependency-cruiser

Read this when a rule fired, when you fixed a baselined violation, or when you want to add a rule
or an exception.

## What is where

| File | Role |
|---|---|
| `server/.dependency-cruiser.cjs` | The rules (`forbidden`) and cruise options |
| `server/.dependency-cruiser-known-violations.json` | Baseline: existing drift, ignored via `--ignore-known` |
| `.github/workflows/server-unit.yml` → *Architecture rules* step | Runs the check on every server/reviewer-core change |

```bash
cd server
pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known        # what CI runs
pnpm exec depcruise src --config .dependency-cruiser.cjs -T err                # include the baselined ones
```

The check takes ~2 s. There is deliberately **no `arch:check` package script**: `server/package.json`
is `skip-worktree` in this repo (the workflows call vitest directly for the same reason), so the CI
step calls `depcruise` inline.

## The rules

| Rule | Protects | Typical fix |
|---|---|---|
| `no-circular` | Unknowable dependency direction | Break the cycle with a port, or move the shared piece inward |
| `domain-is-pure` | Ring 1/2 contracts (`vendor/shared`, `domain/`, `constants.ts`, `types.ts`, `ports.ts`) know no framework, ORM or SDK | Remove the import; express it as a port |
| `domain-no-outer-layers` | Same files may not import `db`, `adapters`, `container`, routes/service/repository | Depend on a port |
| `service-no-http-framework` | Services stay free of `fastify` | The route extracts plain values |
| `orm-only-in-repositories` | Only `repository*` and a module's `mappers.ts` touch `db/schema` / `db/rows`; only `repository*` touches `drizzle-orm` | Move the query into the repository behind a port |
| `mappers-no-orm-library` | `mappers.ts` knows the row *shape* (type imports) but never the ORM | Move the query into `repository.ts` |
| `inner-not-to-container` | No service locator | Inject narrow deps ([composition-root-and-di](composition-root-and-di.md)) |
| `inner-not-to-routes` | Application/infrastructure never import presentation | Invert the dependency |
| `no-import-of-module-registry` | Nobody but `app.ts` imports `modules/index.ts` | Import the module you need |
| `sdk-only-in-adapters` | Octokit/OpenAI/Anthropic/simple-git/ast-grep/tiktoken/ripgrep only in `src/adapters/` | Add a port + adapter |
| `adapters-not-into-modules` | Infrastructure does not import feature modules | Move the shared constant/type inward |
| `no-cross-module-internals` | Other modules see only `index.ts` / `ports.ts` / `types.ts` | Use the port, or promote the piece |

How the rules read files: by **name convention** — `service.ts` / `*.service.ts` are services,
`repository.ts` or `repository/` are repositories, `mappers.ts` is the row mapper beside them,
`ports.ts`, `domain/`, `constants.ts`, `types.ts` are inner contracts. Name files accordingly or the rules cannot see them.

## When a rule fires on your change

1. Read the rule's `comment` (printed with the violation) — it states the intent.
2. Fix the code. The "typical fix" column above is the default.
3. Do **not** add the violation to the baseline to get green. New code must not grow it.

## Shrinking the baseline

After you fix a baselined violation, regenerate and review the diff — it must only **remove** entries:

```bash
cd server
pnpm exec depcruise-baseline src -c .dependency-cruiser.cjs      # rewrites the known-violations file
git diff --stat .dependency-cruiser-known-violations.json
```

Version note: `depcruise-baseline` is the command in the installed `17.4.3`. Newer documentation
deprecates it in favour of `depcruise --baseline`; if you upgrade, both the CI step and this file need
the same check (`depcruise --help`).

## Adding or changing a rule

- Prefer **forbid** rules (name what must not happen): they tolerate rings we have not yet classified,
  whereas allow-lists fail on everything unlisted.
- Give it a kebab-case `name`, `severity: 'error'`, and a `comment` that says *why* — it is what an
  agent reads when it fires.
- Match npm packages with the `npm([...])` helper in the config: it matches the resolved
  `…/node_modules/<pkg>/…` path, which also works for pnpm's nested layout.
- `tsPreCompilationDeps: true` is on so that `import type` edges are seen. Do not turn it off; a type
  leak (`AgentRow` in a service) is exactly what the skill wants to catch.
- **Prove it**: create a throw-away probe file that violates the rule, run without `--ignore-known`,
  confirm the failure, delete the probe. Then regenerate the baseline if the rule catches existing code.

## Exceptions

Prefer fixing. If an exception is genuinely right, scope it narrowly in the rule (`pathNot` with a
comment naming the file and the reason) and record it under *Settled decisions* in
[devdigest-server-mapping](devdigest-server-mapping.md). "It was already like that" is what the
baseline is for; it is not an exception.

## What the check cannot see

- **Logic in a route** — it checks imports, not what a handler does. The reviewer checklist covers it.
- **Unclassified files** — `helpers.ts` and most of `platform/*` have no ring yet.
- **Whether a port is well designed** — SDK-shaped ports pass the linter and still leak.
- **Files outside `src/`** — tests are not cruised.
