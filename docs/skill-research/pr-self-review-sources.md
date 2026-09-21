# pr-self-review — sources

Research log for the `pr-self-review` skill (v1.0.0, 2026-09-21). Same shape as
[`onion-backend-sources.md`](./onion-backend-sources.md).

Unusually for a skill here, the load-bearing sources are **internal**. The gate's
job is to apply conventions this repo already states, so inventing external ones
would have created a second source of truth — the exact failure the architecture
skills were written to avoid.

Status legend: ✅ adopted · ⚠️ adopted with a change · ❌ considered, rejected.

## 1. Review vocabulary — internal, adopted verbatim

| # | Source | Taken | Status |
|---|---|---|---|
| 1.1 | `docs/agent-prompts/README.md` | `CRITICAL/WARNING/SUGGESTION`; `request_changes/approve/comment`; verdict as a pure function of findings; "no findings ⇒ approve"; the anti-inflation rule; findings discipline (distinct only, no count target, zero is good) | ✅ |
| 1.2 | `docs/agent-prompts/general-reviewer.md` | "Trace the execution path, state the mechanism"; "only flag what THIS diff introduces or worsens"; precision over volume | ✅ — quoted almost verbatim in the subagent prompt |
| 1.3 | `reviewer-core/src/review/reduce.ts:14` | Score weights 35 / 12 / 3, floor 0, ceiling 100; score is recomputed, never trusted | ✅ |
| 1.4 | `reviewer-core/src/grounding.ts` | Findings must intersect a real diff hunk; `FULL_FILE_KINDS` exemption | ⚠️ — the exemption is generalized from "kinds" to "phases": every Phase-1/2 finding is exempt, because a `tsc` error is real wherever it lands |
| 1.5 | `run.ts:208` — verdict passed through from the model | ❌ — the gate **derives** the verdict instead. Passing it through is why a wrong verdict can reach the product's UI; a gate must be deterministic |
| 1.6 | `server/src/vendor/shared/contracts/findings.ts` | The `Finding` field set and the `category` enum | ✅ — findings are shaped so they could be fed to the product unchanged |

## 2. Repo invariants — internal, became DET-001…010

| # | Source | Became |
|---|---|---|
| 2.1 | `AGENTS.md` "Gotchas / do-not-touch" | DET-001 (lockfiles), DET-002 (append-only migrations), DET-007 (`docker compose down -v`) |
| 2.2 | `AGENTS.md` "Conventions" | DET-003 (vendored shared), DET-004 (`CLAUDE.md` stubs) |
| 2.3 | `server/.dependency-cruiser-known-violations.json` + `onion-architecture/references/enforcement.md` | DET-005 (the baseline may only shrink), and the whole `accepted.json` design |
| 2.4 | `server/AGENTS.md` "Migrations are NOT applied on boot" | DET-009, DET-010 |
| 2.5 | `.github/workflows/*.yml` | The exact Phase-2 commands, including why the `server` unit command is inlined rather than `pnpm test` |
| 2.6 | `TESTING.md` | DET-016 (logic changed with no test in the change set) |

## 3. Enforcement mechanics — external

| # | Source | Taken | Status |
|---|---|---|---|
| 3.1 | Claude Code hook reference (`PreToolUse`, `permissionDecision: deny`, `systemMessage`) | The gate's output contract | ✅ |
| 3.2 | `.claude/hooks/capture-insights.mjs` | The stdin-JSON / stdout-JSON hook pattern already used here | ✅ |
| 3.3 | Git `merge-base` two-dot diff | `git diff <merge-base> --` yields branch + staged + unstaged in one patch | ✅ — removed the need for three separate diffs |
| 3.4 | `git diff --no-index /dev/null <file>` for untracked files | ❌ — no `/dev/null` on Windows. Untracked files are synthesized as a whole-file hunk in JS |
| 3.5 | `git ls-files -v` | Used to check the `skip-worktree` claim in `server-unit.yml:104`; it is stale in this clone (`H`, not `S`). Recorded in `server/INSIGHTS.md` | ⚠️ |
| 3.6 | Conventional pre-commit frameworks (husky, lint-staged) | ❌ — the repo has none, and a git hook cannot run an LLM review. The `PreToolUse` hook gates the action that matters (`gh pr create`) rather than the commit |

## 4. Design questions where the sources gave no answer

| Question | Chosen | Reasoning |
|---|---|---|
| Derive routing from skill frontmatter? | ❌ no glob field exists; 8 skills are vendored with hashes pinned in `skills-lock.json`, so edits would be clobbered and the hash invalidated | `routing.json` + DET-011 drift detection |
| One subagent per skill or per bundle? | Per bundle | Per-skill re-sends the same slice 5–6× for near-duplicate findings |
| Should a mechanical failure block? | Yes, CRITICAL | It is not a matter of judgment, and it poisons Phase 3 |
| Should the LLM phase run when Phase 1/2 failed? | No (fail-fast, `--full` overrides) | Half the findings become "this doesn't compile" |
| Can an LLM finding be baselined? | No | Freezing it hides a skill that needs tightening; the baseline would become a dumping ground |
| Advisory first or deny first? | Deny, per the user's decision | `advisory` remains available as a config flip |

## 5. Rejected scope (v1.1 candidates)

- **`--fix`** — auto-applying findings. A separate risk class; it should wait until
  the gate has demonstrated its precision.
- **Gating the GitHub MCP `create_pull_request` tool** — a real hole, but it needs
  the tool name in the matcher and a second discrimination path.
- **A recurring-finding → INSIGHTS.md loop** — a finding that recurs across
  branches is exactly what `engineering-insights` wants; needs run history first.
