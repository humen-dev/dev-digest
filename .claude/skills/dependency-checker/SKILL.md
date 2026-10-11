---
name: dependency-checker
description: "Dependency audit for the DevDigest repo and each of its packages (server, client, reviewer-core, mcp, e2e, evals): maps how packages depend on each other, measures every dependency's installed size (own, transitive closure, exclusive), classifies it by kind (prod/dev/peer) and type (framework, AI SDK, ORM, testing, build tooling…), detects unused / misplaced / duplicated / drifting / vulnerable / outdated dependencies, and writes a structured report with Mermaid diagrams, tables, a prioritized P0–P3 action plan and advice. Use whenever the user asks about dependencies, packages, node_modules size, 'what does X pull in', 'why is install so big', unused or outdated packages, version drift between packages, npm/pnpm audit, a dependency health check or cleanup — even if they never say 'dependency-checker'. Not for upgrading or installing packages (it only recommends), not for code-level vulnerability review (`security`), not for import-direction rules inside server/ (`onion-architecture`)."
metadata:
  version: "1.0.0"
---

# Dependency Checker

Answers one question for developers: **what do our packages depend on, what does
it cost, and what should we fix first?**

The work is split on purpose:

| Part | Who | Why |
|---|---|---|
| Facts — package graph, sizes, usage scan, duplicates, drift, audit, outdated, rule-based findings | `scripts/collect.mjs` (no deps, Node ≥ 22) | Numbers must be reproducible, not estimated by a model |
| Diagrams + fact tables | `scripts/report.mjs` | Same snapshot → same report layout every run |
| Verification, classification, prioritization, advice | **you** (the agent) | Judgment: false positives, trade-offs, effort |

Version 1.0.0 — design notes and history are in [README.md](README.md).

## Hard rules

- **Read-only.** Never install, uninstall, upgrade, `npm ci`, `pnpm add`, edit a
  `package.json` or touch a lockfile. The repo forbids hand-editing lockfiles, and
  the user verifies changes themselves. You **recommend** commands; you never run them.
- Only the two scripts below write files: the snapshot JSON and the report Markdown
  under `docs/dependencies/`.
- Every claim in the report cites a finding ID (`F07`) or a number from the snapshot.
  No sizes from memory, no "this library is usually heavy".
- Packages here are **standalone, not a workspace** — each has its own lockfile and
  manager (pnpm: server, client, evals · npm: reviewer-core, e2e, mcp). Every
  command you recommend uses that package's manager and runs in that package's dir.

## Workflow

### 1. Scope

Defaults: all packages, with `--audit --outdated` (read-only registry queries).
Narrow only if the user asks: `--packages server,client`. Use offline mode (drop
both flags) if the user says so or the network fails — the report then states that
security/freshness was not checked.

### 2. Collect facts

```bash
node .claude/skills/dependency-checker/scripts/collect.mjs --audit --outdated
```

Writes `docs/dependencies/snapshots/YYYY-MM-DD.json` and auto-diffs against the
newest older snapshot. Options: `--packages a,b`, `--out <file>`,
`--baseline <file>`, `--no-baseline`. Takes ~10 s offline; audit adds network time.
If a package prints `audit: …` errors, keep going — note it in the report.

### 3. Render the skeleton

```bash
node .claude/skills/dependency-checker/scripts/report.mjs docs/dependencies/snapshots/YYYY-MM-DD.json
```

Writes `docs/dependencies/YYYY-MM-DD.md` with sections 2–10 and 13 filled and
`<!-- AGENT: … -->` markers where your judgment goes.

### 4. Verify findings before ranking them

The rules are heuristics. Before a finding reaches the action plan, check it:

| Rule | Verify with | Typical false positive |
|---|---|---|
| `possibly-unused` | Grep the package for the name, dynamic `import(`/`require(` with variables, plugin names in config; is it a peer the app must own? | `postcss` next to `@tailwindcss/postcss` (peer, declared on purpose); Fastify/PostCSS/Vitest plugins referenced by a computed string; CLI used only in docs |
| `dev-used-in-prod` | Is the importing file really shipped at runtime? | Seed scripts, codegen, files only run by tooling |
| `tooling-in-prod` | Is it used at runtime (adapter, CLI spawned by the app)? | A tool the server spawns as a child process |
| `heavy-prod-dep` | Is install size the cost, or bundle size? | Icon libraries / frameworks — big on disk, tree-shaken in the bundle |
| `duplicate-versions` | Which parents require each version (`pnpm why` / `npm ls` — recommend, don't run) | Platform binaries pinned by different tool majors |
| `vulnerability` | Is the vulnerable path reachable from prod code? Dev-only? | Advisory in a test-only transitive dep |

Record false positives in section 10's marker (`F07 — false positive: …`). Raise or
lower a priority only with a one-line reason; the rubric is
[references/priority-rules.md](references/priority-rules.md).

### 5. Fill the judgment sections

Follow [references/report-format.md](references/report-format.md) exactly:
Summary (§1), classification of "Other" deps (§5), false positives (§10),
Prioritized action plan (§11), Recommendations (§12). Draw remedies from
[references/advice-playbook.md](references/advice-playbook.md) — it maps each rule
to the fix and the exact pnpm/npm command shape.

### 6. Self-check (do not skip)

- [ ] No `<!-- AGENT:` marker is left in the report.
- [ ] Every action-plan row cites ≥ 1 finding ID and has a concrete command or edit.
- [ ] Every cited ID was looked up in **this** snapshot (`findings[].id`) and matches the package/dependency you describe — IDs are renumbered on every run.
- [ ] Every command uses the package's own manager and `cd <pkg>` (or `--dir`/`--prefix`).
- [ ] P0/P1 rows were verified in step 4; false positives are listed, not silently dropped.
- [ ] Install size and bundle size are not confused anywhere.
- [ ] Security section says "not run" if audit was skipped or failed — never "no vulnerabilities".

### 7. Reply in chat

Short, in the user's language: health verdict (one line), finding counts by
priority, the top 5 actions as a table (`# · P · Action · Package · Impact`), what
was not checked, and a link to the report file. The report itself stays in English.

## Output contract

```
docs/dependencies/
├── YYYY-MM-DD.md                 # the report (§1–13 + Method & caveats)
└── snapshots/YYYY-MM-DD.json     # machine facts; the next run diffs against it
```

Report sections, in order — names fixed so reports diff cleanly over time:
1 Summary · 2 Component map · 3 Weight map · 4 Size overview · 5 Dependencies by
type · 6 Per-package dependencies · 7 Shared across packages · 8 Duplicate versions ·
9 Security & freshness · 10 Findings · 11 Prioritized action plan · 12 Recommendations ·
13 Change since baseline (when a baseline exists) · Method & caveats.

## Tuning

Type taxonomy, shared-contract libraries and thresholds (heavy prod closure 20 MB,
duplicate waste 512 KB, top-N in diagrams) live in
[categories.json](categories.json). When you classify an "Other" dependency,
propose the pattern for that file in §5 — add it only if the user agrees.
