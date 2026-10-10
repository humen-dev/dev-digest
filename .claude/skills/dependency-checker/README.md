# dependency-checker

**Version 1.0.0** · created 2026-10-08 · scope: repo-wide, all packages

A skill that audits the dependencies of every DevDigest package and of the repo as
a whole, and turns them into a report developers can act on: a component map, a
weight map, size and type tables, rule-based findings, and a prioritized P0–P3
action plan with exact commands.

`SKILL.md` is what the agent loads. This README is for humans.

## Layout

```
dependency-checker/
├── SKILL.md                      # agent workflow, hard rules, output contract
├── categories.json               # type taxonomy, shared-contract libs, thresholds
├── scripts/
│   ├── lib.mjs                   # fs / size / Node-resolution / semver helpers
│   ├── collect.mjs               # facts → docs/dependencies/snapshots/<date>.json
│   └── report.mjs                # snapshot → docs/dependencies/<date>.md skeleton
└── references/
    ├── report-format.md          # how the agent fills the judgment sections
    ├── priority-rules.md         # P0–P3 rubric, rule → default priority
    └── advice-playbook.md        # rule → remedy → pnpm/npm command shape
```

## Run it by hand

```bash
node .claude/skills/dependency-checker/scripts/collect.mjs --audit --outdated
node .claude/skills/dependency-checker/scripts/report.mjs docs/dependencies/snapshots/<date>.json
```

Without `--audit --outdated` it runs fully offline (~10 s for the whole repo).
Through the agent: ask "check our dependencies" or `/dependency-checker`.

## Design decisions

- **Facts by script, judgment by agent.** Sizes, closures, duplicates and drift are
  computed, never estimated by a model. The agent only verifies, ranks and advises,
  and must cite finding IDs — so two runs on the same tree give the same numbers.
- **Zero dependencies.** The scripts use Node built-ins only, so the skill works on
  a fresh clone and never adds to the problem it measures.
- **Standalone packages, not a workspace.** Each package is analysed with its own
  manager and lockfile; resolution follows Node's algorithm from the real path, so
  pnpm's `.pnpm` store and npm's hoisted tree are measured the same way.
- **Three sizes per dependency.** *Own* (its folder), *closure* (with everything it
  pulls in) and *exclusive* (what disappears if only it is removed). Exclusive is
  the number that answers "what do we save".
- **Internal graph from tsconfig `paths`.** This repo shares code via aliases and
  vendored copies (`@devdigest/shared`, `@devdigest/reviewer-core`), not installs,
  so the component map is built from aliases.
- **Read-only.** It never installs or edits manifests/lockfiles (repo rule: lockfiles
  change only via the package manager, by a developer).
- **Snapshots enable trends.** Each run diffs against the newest older snapshot
  (§13 of the report).

## Evals

Live in `evals/` (not here — a fixture inside the skill would leak into its prompt):

| File | Tier | Checks |
|---|---|---|
| `evals/skills/dependency-checker/dependency-checker.scripts.eval.ts` | deterministic, no model (~1 s) | `collect.mjs` / `report.mjs` on a synthetic repo: sizes, closures, unused, misplaced, drift, stray installs, alias graph, ID order, report sections, baseline diff |
| `evals/skills/dependency-checker/dependency-checker.eval.ts` | quality, LLM judge | Filling the judgment sections: verdict scale, manager per package, grouping, false positives, install vs bundle size, "audit not run" honesty |
| `evals/workflow/dependency-checker-workflow.eval.ts` | activation | Activates on a size/unused question; does not activate on "add a package" |

```bash
cd evals && pnpm vitest run skills/dependency-checker
pnpm eval:benchmark skills/dependency-checker/dependency-checker.eval -n 5   # lift vs no skill
```

## Known limits

- Usage detection is a static text scan; dynamic imports by computed name are
  invisible → `possibly-unused` is a lead, verified by the agent.
- Install size ≠ browser bundle size; the report says so wherever it matters.
- `npm audit` / `pnpm audit` / `outdated` need network access to the registry.

## History

- **1.0.0** (2026-10-08) — first version.
