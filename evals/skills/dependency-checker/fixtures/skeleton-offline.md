# Dependency report — 2026-10-02

> 2 packages · 14 direct dependencies · findings **P0 0 · P1 1 · P2 2 · P3 1**  
> audit: not run · outdated: not run · baseline: 2026-09-01 · snapshot: `docs/dependencies/snapshots/2026-10-02.json`

## 1. Summary

<!-- AGENT: 3–5 bullets. Overall health verdict in one line first (healthy / needs attention / at risk), then the biggest risk, the biggest size win, and anything blocking. Each bullet cites finding IDs. -->

## 4. Size overview

| Package | Manager | Prod / dev deps | Lockfile pkgs | Prod footprint | Full footprint | node_modules on disk | Unreachable |
|---|---|---|---|---|---|---|---|
| api | pnpm-lock.yaml | 8 / 4 | 298 | 58.0 MB | 150 MB | 151 MB | 1.2 MB |
| tools | package-lock.json | 0 / 2 | 40 | 0 B | 36.7 MB | 36.7 MB | 9.7 KB |

## 9. Security & freshness

Not run — rerun the collector with `--audit --outdated` (network, read-only) to include vulnerabilities and available upgrades.

## 10. Findings (automated)

| ID | P | Rule | Package | Dependency | Finding | Evidence |
|---|---|---|---|---|---|---|
| F01 | P1 | possibly-unused | api | `p-retry` | Declared in prod but no import, string reference, config or script usage was found. | no references found |
| F02 | P2 | tooling-in-prod | api | `pino-pretty` | In dependencies but used only by tests/config/scripts — inflates the production install by up to 3.1 MB. | 1 config/script/style files |
| F03 | P2 | duplicate-versions | api | `@types/node` | 2 versions installed side by side (2.0 MB redundant, in the production tree). | 18.19.130, 22.19.19 |
| F04 | P3 | loose-specifier | tools | `tsx` | Specifier "latest" is open-ended or non-registry. | bins: tsx |

<!-- AGENT: list any finding you verified as a false positive here ("F07 — false positive: <reason>") and drop it from the plan. -->

## 11. Prioritized action plan

<!-- AGENT: table | # | P | Action | Findings | Impact | Effort | Command / change |. Order by priority, then impact/effort. Every row cites finding IDs and gives a concrete command or edit for the right package manager (pnpm for pnpm-lock packages, npm for package-lock packages). Never run the commands. -->

## 12. Recommendations

<!-- AGENT: grouped advice beyond single findings — Security · Size & performance · Consistency across packages · Hygiene & process. 2–4 bullets per group, each tied to evidence in this report. -->
