---
name: pr-self-review
description: "Pre-PR gate for DevDigest: reviews all LOCAL open changes (branch commits + staged + unstaged + untracked) before a pull request is opened, routes the repo's own skills onto the files that actually changed (UI skills on UI files, backend/architecture skills on backend files), runs the repo's typecheck/test/depcruise checks for the touched packages, and blocks `gh pr create` while any CRITICAL finding stands. Use whenever the user is about to open a PR — 'open a PR', 'push and create a PR', 'is this ready to merge', 'review my changes before I push', /pr-self-review — and whenever `gh pr create` was just refused by the gate. Not for reviewing an already-open PR or a remote diff (`code-review`, `pr-review-toolkit:review-pr`), not a standalone vulnerability audit (`security`, `security-review`), not for capturing learnings (`engineering-insights`)."
metadata:
  version: "1.0.0"
---

# PR Self Review

The gate that stands between local work and `gh pr create`. It answers one
question: **would this change set survive review?** — using the repo's own skills
as the review lenses, the repo's own CI commands as the mechanical check, and the
repo's own severity vocabulary for the verdict.

Version 1.0.0 — sources, rationale and history are in [README.md](README.md).

## Scope — what this skill owns, and what it leaves to others

| Question | Owner |
|---|---|
| What is in the change set? Which skills apply to it? Does it pass? May the PR be opened? | **this skill** |
| Is this backend file in the right ring? | `onion-architecture` |
| Where does this UI file live, how is it split? | `frontend-ui-architecture` |
| Effects, memoization, keys, a11y | `react-best-practices` |
| Fastify / Drizzle / Postgres / Zod technique | the matching skill |
| Vulnerabilities in the changed code | `security` |
| Capturing what was learned | `engineering-insights` |

This skill never restates another skill's rules — it **routes** to them. The
routing table is [routing.json](routing.json); it is data, not prose, so the CLI
and the agent read the same thing.

## The vocabulary is the product's own — do not invent a new one

Taken verbatim from [`docs/agent-prompts/README.md`](../../../docs/agent-prompts/README.md):

- Severity is exactly **`CRITICAL | WARNING | SUGGESTION`**. **CRITICAL is the only
  level that blocks.**
- Verdict is exactly **`request_changes | approve | comment`**, and it is a *pure
  function* of the findings: ≥1 CRITICAL → `request_changes`; findings but no
  CRITICAL → `comment`; **empty → `approve`**.
- Score is **recomputed**, never reported by a model: `100 − 35·CRIT − 12·WARN −
  3·SUGG` (`reviewer-core/src/review/reduce.ts:14`).
- **Anti-inflation:** a speculative issue ("might be", "could potentially", "if X
  isn't already handled") is at most `WARNING`, never `CRITICAL`.
- **Grounding:** a Phase-3 finding whose line range does not intersect a real diff
  hunk is dropped (`reviewer-core/src/grounding.ts`). Cite real `file:line` from
  the diff or the finding disappears.
- **Findings discipline:** distinct only, no padding toward a count, **zero is a
  good answer**.

## The four phases

Cheapest first, fail-fast. Phases 0–2 and 4 are the CLI's job; **Phase 3 is yours**.

| Phase | What | Who |
|---|---|---|
| 0 Collect | change set, changed-line index, routing, signature, fast paths | CLI |
| 1 Repo invariants | DET-001…018, filtered through `accepted.json` | CLI |
| 2 Mechanical | the repo's CI commands for the touched packages | CLI |
| 3 Skill review | one subagent per bundle, reduced here | **the agent** |
| 4 Seal / block | green ⇒ `state.json` + `pr-body.md`; else refuse | CLI |

Fail-fast is deliberate: a failing typecheck poisons Phase 3, because half the
findings become "this doesn't compile" and a whole diff pass is spent on code the
author is about to change anyway.

## Workflow

Copy this checklist and work through it:

```
- [ ] 1. Run the CLI
- [ ] 2. Blocked? report and STOP — do not open the PR
- [ ] 3. PHASE3_REQUIRED? dispatch one subagent per bundle
- [ ] 4. Collect the bundles into one JSON file
- [ ] 5. Feed it back with `report --phase3`
- [ ] 6. Relay the verdict; open the PR only if the gate sealed
```

### 1. Run the CLI

```bash
node .claude/skills/pr-self-review/scripts/pr-self-review.mjs run
```

It prints the full report itself — do not re-derive or re-format it, relay it.

### 2. If it ends in `BLOCKED`

Stop. Do **not** run `gh pr create` (the `PreToolUse` hook will refuse it anyway).
Report the CRITICAL findings and what each one needs. Offer to fix them. After a
fix, run the CLI again — the signature changed, so the gate re-evaluates.

### 3. If it ends in `PHASE3_REQUIRED`

Read `.claude/.pr-self-review/run.json` for `routing.bundles`. **Dispatch one
`general-purpose` subagent per bundle, all in parallel, in a single message.**

One subagent per *bundle*, never per skill: per-skill dispatch re-sends the same
diff slice 5–6× for near-duplicate findings. The full prompt template is in
[references/review-dispatch.md](references/review-dispatch.md) — use it verbatim.
Each subagent gets:

- **only its bundle's file list**, and the diff restricted to those files
  (`git diff <base> -- <file> <file> …`, base is in `run.json`),
- the paths of **only its bundle's skills** (`.claude/skills/<skill>/SKILL.md`),
- the contract: read those skill files and nothing else, cite `file:line` from the
  provided diff, use the three severities, flag only what **this diff** introduces
  or worsens, return one fenced ```json block.

If a bundle's slice exceeds ~1500 changed lines, split it by **whole files** into
at most 3 subagents and merge.

### 4–5. Reduce

Write every bundle's result into one file:

```json
{ "bundles": [ { "bundle": "backend", "summary": "…", "findings": [ … ] } ] }
```

A bundle whose output would not parse gets `{ "bundle": "x", "error": "…" }` —
retry it **once** first. Then:

```bash
node .claude/skills/pr-self-review/scripts/pr-self-review.mjs report --phase3 <file>
```

The CLI dedupes, grounds, recomputes the score, derives the verdict, and seals
only if the result is clean **and** complete.

### 6. Relay

Report the verdict plainly. If it sealed, `gh pr create` is now unblocked and
`.claude/.pr-self-review/pr-body.md` holds a drafted body the author can edit.

## MUST rules

- MUST NOT open a PR while any CRITICAL stands — not by `gh pr create`, not by
  `/commit-commands:commit-push-pr`, not by asking the user to run it.
- MUST NOT suggest `PR_SELF_REVIEW_BYPASS=1` as a way past a real finding. It
  exists for emergencies the *user* declares, not for the agent's convenience.
- MUST NOT take a subagent's `score` or `verdict` — both are recomputed.
- MUST NOT accept a Phase-3 finding into `accepted.json`. A wrong LLM finding is
  fixed by tightening the routed skill or the code, never by freezing it.
- MUST re-run the CLI after any fix: the signature changed, so the seal is void.
- MUST report honestly when a phase was skipped, and say further findings are
  likely once the blocker is cleared.

## When a finding is a genuine false positive

Only for Phase 1/2 findings, and only with a reason:

```bash
node .claude/skills/pr-self-review/scripts/pr-self-review.mjs accept "<key>" --reason "…"
```

The report prints the key for every blocking finding. `accepted.json` is committed
like any other file, so a suppression is reviewable — the same shape as
`server/.dependency-cruiser-known-violations.json`. Suppressed findings still
appear in the report count; they never become invisible.

## Other commands

| Command | Use |
|---|---|
| `routing --dry` | print the routing decision only, run nothing — debug `routing.json` |
| `status` | is the gate open for the current change set? |
| `run --skip-mechanical` | CI just ran the checks |
| `run --full` | do not fail fast — collect every phase's findings |
| `run --only=det` \| `--only=mech` | debugging; **never seals** |
| `seal --force --reason "…"` | deliberate override, recorded in the report |

## References — read when the task needs it

- [references/deterministic-rules.md](references/deterministic-rules.md) — DET-001…018, what each detects and why
- [references/mechanical-checks.md](references/mechanical-checks.md) — package → command matrix, output parsers
- [references/review-dispatch.md](references/review-dispatch.md) — the subagent prompt template and the reduce algorithm
- [references/gate-and-hook.md](references/gate-and-hook.md) — signature, state, hook contract, overrides, known limits
- [references/tuning.md](references/tuning.md) — fast paths, the cache, `accepted.json`, `gateFailOn`
