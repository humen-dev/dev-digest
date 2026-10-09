# Dependency report — 2026-10-03

> 3 packages · 24 direct dependencies · findings **P0 0 · P1 0 · P2 4 · P3 1**  
> audit: run · outdated: run · baseline: 2026-09-03 · snapshot: `docs/dependencies/snapshots/2026-10-03.json`

## 1. Summary

<!-- AGENT: 3–5 bullets. Overall health verdict in one line first (healthy / needs attention / at risk), then the biggest risk, the biggest size win, and anything blocking. Each bullet cites finding IDs. -->

## 4. Size overview

| Package | Manager | Prod / dev deps | Lockfile pkgs | Prod footprint | Full footprint | node_modules on disk | Unreachable |
|---|---|---|---|---|---|---|---|
| api | pnpm-lock.yaml | 10 / 6 | 330 | 64.0 MB | 170 MB | 171 MB | 0.8 MB |
| web | pnpm-lock.yaml | 6 / 0 | 380 | 351 MB | 351 MB | 352 MB | 0.4 MB |
| core | package-lock.json | 2 / 0 | 60 | 13.8 MB | 13.8 MB | 86.2 MB | **72.4 MB** |

## 6. Per-package dependencies (excerpt)

| Package | Dependency | Kind | Own | Closure (pkgs) | Exclusive | Usage |
|---|---|---|---|---|---|---|
| web | `mermaid` | prod | 23.1 MB | 115 MB (111) | 113 MB | prod 1 |
| api | `testcontainers` | dev | 1.2 MB | 47.6 MB (157) | 0 B | **none found** |
| api | `openai` | prod | 8.4 MB | 13.8 MB (40) | 8.4 MB | prod 2 |

## 7. Shared across packages

| Dependency | Packages | Versions (specifier → installed) | Drift |
|---|---|---|---|
| `zod` | 3 | api: ^3.24.1 → 3.25.76<br/>web: ^3.24.1 → 3.25.76<br/>core: ^3.22.0 → 3.22.4 | **minor** |

## 9. Security & freshness

- **api**: no advisories, nothing outdated.
- **web**: no advisories, nothing outdated.
- **core**: no advisories, nothing outdated.

## 10. Findings (automated)

| ID | P | Rule | Package | Dependency | Finding | Evidence |
|---|---|---|---|---|---|---|
| F1 | P2 | stray-install | core | — | node_modules holds 72.4 MB that no declared dependency reaches (leftovers of another package manager: .pnpm, .ignored_typescript). | .pnpm, .ignored_typescript |
| F2 | P2 | heavy-prod-dep | web | `mermaid` | Production dependency pulls 115 MB across 111 packages (exclusive 113 MB). | prod 1 file: src/tour/ArchitectureDiagram.tsx |
| F3 | P2 | version-drift | — | `zod` | minor version drift across packages — shared contracts (vendored @devdigest/shared) compile against each copy. | api: ^3.24.1 (3.25.76) · web: ^3.24.1 (3.25.76) · core: ^3.22.0 (3.22.4) |
| F4 | P2 | duplicate-versions | api | `@types/node` | 2 versions installed side by side (2.0 MB redundant, in the production tree). | 18.19.130, 22.19.19 |
| F5 | P3 | possibly-unused | api | `testcontainers` | Declared in dev but no import, string reference, config or script usage was found. | also installed transitively via @testcontainers/postgresql |

<!-- AGENT: list any finding you verified as a false positive here ("F07 — false positive: <reason>") and drop it from the plan. -->

## 11. Prioritized action plan

<!-- AGENT: table | # | P | Action | Findings | Impact | Effort | Command / change |. Order by priority, then impact/effort. Every row cites finding IDs and gives a concrete command or edit for the right package manager (pnpm for pnpm-lock packages, npm for package-lock packages). Never run the commands. -->

## 12. Recommendations

<!-- AGENT: grouped advice beyond single findings — Security · Size & performance · Consistency across packages · Hygiene & process. 2–4 bullets per group, each tied to evidence in this report. -->
