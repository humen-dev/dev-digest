# pr-self-review

**Version 1.0.0** · created 2026-09-21 · scope: repo-wide, pre-PR gate

A skill for **reviewing local changes before a pull request exists**: it takes
everything currently open (branch commits + staged + unstaged + untracked), works
out which of the repo's skills apply to the files that actually changed, runs the
repo's own CI commands for the touched packages, and refuses to let `gh pr create`
through while any CRITICAL finding stands.

`SKILL.md` is what the agent loads. This README is for humans: motivation, design
decisions, versioning and sources.

## Why this skill exists

The repo has 13 skills that encode how it must be written, and CI that enforces
typecheck, tests and dependency-cruiser. Nothing connected them to *local* work: a
branch got pushed and a PR opened before any of that knowledge was applied, so
violations surfaced in CI or in review — after the PR existed, when fixing them is
a force-push and a re-review.

This skill closes that loop. It is the only place that knows **which skill applies
to which file**, which is the piece none of the individual skills can own.

| Topic | Owner |
|---|---|
| What is in the change set; which skills apply; does it pass; may the PR open | **this skill** |
| Backend ring placement and import direction | `onion-architecture` |
| UI code organization | `frontend-ui-architecture` |
| React runtime rules | `react-best-practices` |
| Fastify / Drizzle / Postgres / Zod technique | the matching skill |
| Vulnerabilities in changed code | `security` |
| Capturing what was learned | `engineering-insights` |

## Contents

```
pr-self-review/
  SKILL.md                              # phases, workflow, MUST rules, dispatch summary
  README.md                             # this file
  routing.json                          # glob -> skills + the gate config block
  accepted.json                         # false-positive baseline (committed, reasoned)
  references/
    deterministic-rules.md              # DET-001…018: what each detects and why
    mechanical-checks.md                # package -> command matrix, output parsers, spawning
    review-dispatch.md                  # the verbatim subagent prompt + reduce algorithm
    gate-and-hook.md                    # signature, state, hook contract, overrides, limits
    tuning.md                           # fast paths, cache, accepted.json, gateFailOn
  scripts/
    signature.mjs                       # git + signature primitives (shared with the hook)
    lib.mjs                             # glob, diff parsing, routing, scoring
    rules.mjs                           # Phase 1
    checks.mjs                          # Phase 2
    report.mjs                          # rendering + PR-body draft
    pr-self-review.mjs                  # the CLI
```

Artifacts outside the skill folder:

```
.claude/hooks/pr-gate.mjs               # the PreToolUse gate
.claude/settings.json                   # registers it (alongside the existing Stop hook)
.claude/.pr-self-review/                # gitignored state: seal, run, report, pr-body
docs/skill-research/pr-self-review-sources.md
```

Progressive disclosure: `SKILL.md` (~150 lines) loads when the skill triggers; each
reference is read only when the task needs it.

## Design decisions

| Decision | Chosen | Why |
|---|---|---|
| How routing is decided | A checked-in `routing.json` | No `SKILL.md` in the repo carries a path glob, and the frontmatter is heterogeneous. Adding one would mean editing 8 vendored skills whose hashes are pinned in `skills-lock.json` — clobbered on re-vendor. An LLM pass over 13 prose descriptions every run is slow and non-deterministic |
| Keeping routing correct | DET-011, not memory | A skill with no routing entry is reported on the next run; CRITICAL when the change set itself adds the `SKILL.md` |
| Execution model | One `general-purpose` subagent per **bundle** | Inline burns the window on skill bodies before a finding appears; per-skill re-sends the same slice 5–6× for near-duplicate findings |
| Severity vocabulary | The product's own, verbatim | `CRITICAL/WARNING/SUGGESTION` + `request_changes/approve/comment` already exist in `docs/agent-prompts/`. A second scale would drift and inflate |
| Score and verdict | Always recomputed / derived | Deliberately stricter than the product's own pass-through at `run.js:208`: a gate must be deterministic |
| Grounding | Phase 3 only | A `tsc` error or a modified migration is real regardless of hunk intersection — the same exemption as `FULL_FILE_KINDS` in `grounding.ts:16` |
| Mechanical failures | Deterministic CRITICAL | A type error is not a matter of judgment, and it poisons the LLM phase if allowed through |
| Integration / e2e tests | Never run | Docker and a live stack are too expensive for a gate; DET-014 hands the responsibility back |
| Ordering | Fail-fast | A failing typecheck makes half the Phase-3 findings "this doesn't compile" |
| False positives | `accepted.json`, committed and reasoned | Without a reviewable valve, one wrong CRITICAL becomes a permanent `BYPASS=1` habit. Phase-3 findings are excluded on purpose |
| Blocking threshold | `gate.gateFailOn`, default `critical` | Mirrors `agents.ciFailOn`; configuration, not code |
| Skills vs Markdown | Skills are code lenses | A `.md` file has no skill lens; routing it produced nonsense like `e2e/specs/README.md` → `typescript-expert` |
| Docs-only diffs | Fast path | The branch this was built on is 56 files of near-pure Markdown |
| Phase-3 cache store | A separate keyed file, not `run.json` | `run.json` is the last run's record, so a cache miss would erase it — change a file, run, revert, and a paid-for review is gone |
| What `configHash` covers | Config, routed skill bodies **and the gate's own scripts** | A key must cover the code that produces the result: editing a parser in `checks.mjs` has to invalidate a cached `ok` |
| Hook placement | `.claude/settings.json`, matcher `Bash` | `settings.local.json` is gitignored and would not reach the team. The matcher narrows to the tool; command discrimination is in the script |
| Bypass source | The command text, not `process.env` | It must be typed each time and stay visible in the transcript |

## Validation

Built and proved on the `docs/agents-md-rename` branch (56 files, +4689/−253). The
first real run surfaced five bugs in the rules themselves, all fixed:

- DET-004 demanded `CLAUDE.md` be *exactly* `@AGENTS.md`; the repo's stubs
  legitimately carry an HTML comment header. Now comments are stripped first.
- DET-007 fired on `AGENTS.md` warning **against** `docker compose down -v`, and on
  this skill's own regex. Command rules now skip prose files, and every added-line
  rule skips this skill's directories.
- The gate's own untracked state directory was being reviewed as part of the change
  set — fixed in `.gitignore` and defensively in the scanner.
- `findingKey` stripped the trailing number from every id, turning `DET-004` into
  `DET`. Only `MECH-` ids drop their ordinal now.
- `--only=det` sealed the gate from a partial run. `--only` now marks the run
  incomplete, and an incomplete run is never sealed.
- **Windows:** `spawnSync('pnpm.cmd', …, { shell: false })` fails with `EINVAL` on
  Node 22 — the fix for CVE-2024-27980 refuses to spawn `.cmd` shims without a
  shell. Every mechanical check reported "could not start" instead of running.
  `shell` is now enabled on `win32` only; cmd.exe does not expand `*`, so the
  glob arguments survive, and POSIX keeps `shell: false`.
- A green seal survived an **incomplete re-run of the same change set**, so a
  failed re-review rode on the earlier pass. Any run that does not seal now clears
  a prior seal for that signature.
- Acceptance keys were printed for CRITICAL findings only, leaving a recurring
  WARNING impossible to retire. Every Phase-1/2 finding now gets one.

Measured on this repo: docs-only run **1.1s**; Phase 1 **0.1s**; `server`
typecheck + unit tests **13.8s** cold, **0.0s** reused from cache; hook **~137 ms**
on a non-matching Bash call.

Phase 3's parent-side contract is verified with synthetic bundle output — grounded
findings kept, two hallucinated ones dropped, verdict falling back from
`request_changes` to `comment`, and an unparseable bundle refusing to seal. The
live dispatch of a model into that contract is exercised the first time the skill
runs for real.

Hook discrimination verified in both PowerShell and Git-Bash: allows
`gh pr view|list|checkout`, any non-`gh` command, any non-Bash tool, and
`git commit -m "gh pr create"`; denies `gh pr create --fill` and
`git push -u origin HEAD && gh pr create --fill`; honours `PR_SELF_REVIEW_BYPASS=1`
with an advisory message.

## Versioning

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-09-21 | Initial: 4 phases, DET-001…018, mechanical checks for 4 packages, bundle dispatch, `PreToolUse` gate, docs-only fast path, incremental cache, `accepted.json`, PR-body draft |

Bump the minor version when a DET rule or a check is added, the patch version for
wording. **Never renumber an existing DET rule** — the id is part of every
`accepted.json` key.

## Sources

Research notes: [`docs/skill-research/pr-self-review-sources.md`](../../../docs/skill-research/pr-self-review-sources.md).

The load-bearing sources are in this repo:

- [`docs/agent-prompts/README.md`](../../../docs/agent-prompts/README.md) — severity, verdict, score and grounding conventions, taken verbatim
- [`server/src/vendor/shared/contracts/findings.ts`](../../../server/src/vendor/shared/contracts/findings.ts) — the `Finding` / `Review` shape
- [`reviewer-core/src/review/reduce.ts`](../../../reviewer-core/src/review/reduce.ts), [`grounding.ts`](../../../reviewer-core/src/grounding.ts) — scoring weights and the grounding gate
- [`.github/workflows/`](../../../.github/workflows/) — the exact CI commands
- [`AGENTS.md`](../../../AGENTS.md) — the repo invariants that became DET-001…010
- [`server/.dependency-cruiser-known-violations.json`](../../../server/.dependency-cruiser-known-violations.json) — the baseline pattern `accepted.json` copies
