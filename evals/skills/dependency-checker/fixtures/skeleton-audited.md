# Dependency report — 2026-10-01

> 3 packages · 21 direct dependencies · findings **P0 1 · P1 3 · P2 4 · P3 2**  
> audit: run · outdated: run · baseline: none · snapshot: `docs/dependencies/snapshots/2026-10-01.json`

## 1. Summary

<!-- AGENT: 3–5 bullets. Overall health verdict in one line first (healthy / needs attention / at risk), then the biggest risk, the biggest size win, and anything blocking. Each bullet cites finding IDs. -->

## 4. Size overview

| Package | Manager | Prod / dev deps | Lockfile pkgs | Prod footprint | Full footprint | node_modules on disk | Unreachable |
|---|---|---|---|---|---|---|---|
| api | pnpm-lock.yaml | 9 / 4 | 310 | 61.2 MB | 158 MB | 160 MB | 1.9 MB |
| web | pnpm-lock.yaml | 4 / 3 | 402 | 352 MB | 431 MB | 432 MB | 0.9 MB |
| engine | package-lock.json | 1 / 0 | 88 | 13.8 MB | 13.8 MB | 89.1 MB | **75.3 MB** |

## 7. Shared across packages

| Dependency | Packages | Versions (specifier → installed) | Drift |
|---|---|---|---|
| `zod` | 2 | api: ^3.24.1 → 3.25.76<br/>engine: ^3.22.0 → 3.22.4 | **minor** |
| `vitest` | 2 | api: ^2.1.8 → 2.1.9 (dev)<br/>web: ^2.1.8 → 2.1.9 (dev) | aligned |

## 9. Security & freshness

**api — vulnerabilities**

| Package | Worst severity | Advisories | Direct | Tree | Examples | Fixed in |
|---|---|---|---|---|---|---|
| simple-git | critical | 3 | yes | **prod** | simple-git allows remote code execution via unsafe git options | >=3.32.3 |
| vitest | critical | 2 | yes | dev only | vitest dev server allows arbitrary file read | >=4.1.11 |

**web — vulnerabilities**

| Package | Worst severity | Advisories | Direct | Tree | Examples | Fixed in |
|---|---|---|---|---|---|---|
| vitest | critical | 2 | yes | dev only | vitest dev server allows arbitrary file read | >=4.1.11 |

## 10. Findings (automated)

| ID | P | Rule | Package | Dependency | Finding | Evidence |
|---|---|---|---|---|---|---|
| F01 | P0 | vulnerability | api | `simple-git` | simple-git allows remote code execution via unsafe git options | critical · 3 advisories · direct · prod tree · fix: >=3.32.3 |
| F02 | P1 | vulnerability | api | `vitest` | vitest dev server allows arbitrary file read | critical · 2 advisories · direct · dev only · fix: >=4.1.11 |
| F03 | P1 | vulnerability | web | `vitest` | vitest dev server allows arbitrary file read | critical · 2 advisories · direct · dev only · fix: >=4.1.11 |
| F04 | P1 | possibly-unused | api | `@fastify/autoload` | Declared in prod but no import, string reference, config or script usage was found. | no references found |
| F05 | P2 | possibly-unused | web | `postcss` | Declared in dev but no import, string reference, config or script usage was found. | also installed transitively via next |
| F06 | P2 | heavy-prod-dep | web | `lucide-react` | Production dependency pulls 27.4 MB across 2 packages (exclusive 27.3 MB). | 1 prod files |
| F07 | P2 | stray-install | engine | — | node_modules holds 75.3 MB that no declared dependency reaches (leftovers of another package manager: .pnpm, .ignored_zod) — reinstall cleanly with npm ci. | .pnpm, .ignored_zod |
| F08 | P2 | version-drift | — | `zod` | minor version drift across packages — shared contracts (vendored @devdigest/shared) compile against each copy. | api: ^3.24.1 (3.25.76) · engine: ^3.22.0 (3.22.4) |
| F09 | P3 | outdated-major | api | `typescript` | A new major line is available (7.0.2). | 5.9.3 → 7.0.2 |
| F10 | P3 | types-in-prod | api | `@types/node` | @types package in dependencies — belongs in devDependencies. | types for node |

<!-- AGENT: list any finding you verified as a false positive here ("F07 — false positive: <reason>") and drop it from the plan. -->

## 11. Prioritized action plan

<!-- AGENT: table | # | P | Action | Findings | Impact | Effort | Command / change |. Order by priority, then impact/effort. Every row cites finding IDs and gives a concrete command or edit for the right package manager (pnpm for pnpm-lock packages, npm for package-lock packages). Never run the commands. -->

## 12. Recommendations

<!-- AGENT: grouped advice beyond single findings — Security · Size & performance · Consistency across packages · Hygiene & process. 2–4 bullets per group, each tied to evidence in this report. -->
