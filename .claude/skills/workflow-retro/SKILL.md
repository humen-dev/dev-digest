---
name: workflow-retro
description: "Retrospective for a finished multi-agent run in DevDigest — the spec-creator interview, implementation-planner, /impl waves, a review loop, a Workflow() fan-out or any batch of subagents. Measures what the run cost and how it flowed (tokens per agent incl. nested agents, cache hit, tool calls, launch order, parallelism, critical path, human wait, model mix, $ cost), what went wrong (tool errors and denials, re-prompts, rewrites of the same deliverable, files read by several agents, unverified claims in reports), compares it with earlier runs of the same kind, and turns findings into concrete changes to agent definitions, briefs, skills or INSIGHTS.md that are applied only after the user says yes. Invoke only as /workflow-retro [label:<slug>] [kind:<kind>] [since:<ISO>] [no-ledger]."
argument-hint: "[label:<slug>] [kind:spec|plan|impl|review|research|other] [since:<ISO>] [session:<id>] [no-ledger]"
disable-model-invocation: true
---

# /workflow-retro — how did that multi-agent run go?

You are the **analyst** in the main session. The run is over; you look back at it, measure it,
explain it and recommend changes. You do **not** re-run anything and you do **not** edit agents,
skills, plans, specs or product code during the retro — every change is a proposal the user
accepts one by one afterwards.

Tool: `node .claude/skills/workflow-retro/scripts/retro-tools.mjs` (below: `RT`) — read-only,
Node-only (no Python, nothing to install):
- `RT analyze [--since <ISO>] [--session <id>] [--prices <file>] --json` — parses the session
  transcript and every subagent journal.
- `RT trend <analysis.json> --kind <kind> --label <slug>` — compares the run with earlier ledger rows
  of the same kind and prints the ledger row to append.

## Hard rules

1. **Manual only.** Never wire this to a hook, `Stop`/`SubagentStop`, `settings.json` or the tail of
   another skill. Retros cost tokens; the user decides when one is worth it.
2. **Numbers come from `RT`, not from memory.** In-context `<usage>` blocks exclude nested agents and
   are rounded; use them only to cross-check. If `RT` fails, say so and give an in-context retro
   clearly labelled as approximate — never invent a metric. Unknown → `n/a`.
3. **Prices are never hard-coded.** For `$`, get current per-model rates via the `claude-api` skill,
   write them to `.claude/.retro/prices.json` (`{model_substr: {in, out, cache_read, cache_write}}`
   in $/Mtok) and pass `--prices`. Without verified prices, cost is `n/a`.
4. **Writes:** only `.claude/.retro/<label>.json` (raw analysis, git-ignored) and one row in
   `docs/retros/ledger.md` (unless `no-ledger`). Nothing else until the user approves a
   recommendation.
5. **No secrets or prompt bodies in the ledger** — numbers, labels and one-line recommendations only.

## Arguments

| Token | Meaning | Default |
|---|---|---|
| `label:<slug>` | Name of the run under review | `<kind>-<date>` |
| `kind:<kind>` | `spec` · `plan` · `impl` · `review` · `research` · `other` — the trend compares runs of one kind | guess from agent types, confirm in the report |
| `since:<ISO>` | Scope: only agents launched at/after this time (one batch out of a long session) | whole session |
| `session:<id>` | Another session's transcript | current (newest) session |
| `no-ledger` | Report only | ledger row is written |

If the session holds several unrelated batches and no `since:` was given, ask which one to review
(AskUserQuestion, options = the batches with their first launch time) — do not silently merge them.

## Phase 1 — collect

1. `mkdir -p .claude/.retro`, then
   `RT analyze [--since …] [--prices .claude/.retro/prices.json] --json > .claude/.retro/<label>.json`.
2. Read the JSON. Per agent you get: type, depth (nested > 1), model, parallel siblings, resumes
   (SendMessage re-invocations), tokens (in / out / cache-read / cache-write, de-duplicated per API
   message), cache hit, tool calls by name, tool errors with a kind
   (`denied` · `not-found` · `timeout` · `stale-read` · `command-failed` · `other`), deliverables
   written more than once (`rewrites`), unverified markers in its final report, span, cost.
   Run-level: orchestrator usage, duplicated reads (file, readers, ~tokens re-read), human wait
   (AskUserQuestion time) and question count, wall-clock, parallelism, critical path.
3. Re-read the agents' final reports and your own conversation for the qualitative side — the JSON
   tells you *where* to look, the reports tell you *why*.

Caveat to state when relevant: an agent's `span_s` runs from its first to its last journal line, so a
resumed agent's span includes the idle time between resumes (often human think-time). Use
`human_wait_s` to separate the two.

## Phase 2 — analyse

Quantitative (from the JSON):
- **Cost & flow:** totals, top spender, cache hit (< 80 % → something breaks the prompt cache),
  parallelism (≈ 1.0× with independent agents → they could have been dispatched together), critical
  path, launch order — draw it as `A → (B ‖ C) → D`.
- **Model fit:** an expensive model on a mechanical task (search, lookups, formatting) → propose a
  cheaper one via the agent's `model:` frontmatter or the dispatch `model` parameter.
- **Friction:** tool errors by kind and by agent; repeated identical errors are a pattern, one is
  noise.
- **Rework:** resumes and rewrites of the same deliverable. Find *why*: late inputs (designs,
  references, decisions that arrived after the first draft), a vague brief, or the agent's own
  mistake.
- **Duplication:** files read by several agents → pre-read once and pass an excerpt or a path list in
  the brief.
- **Trust:** many unverified markers → the deliverable rests on claims nobody checked; name them.
- **Human loop:** wait time and number of questions; questions the code or a default could have
  answered are waste, questions about genuine decisions are not.
- **Outcome:** what the run produced and whether it was accepted (spec approved, plan-verifier PASS,
  PR merged, findings fixed). Cost per accepted outcome beats raw spend.

Qualitative (from reports and the conversation): what was **hard** (stalls, loops, many questions),
what was **easy** (clean first try), what was **duplicated**, what was **missed** (caught later by the
user, a reviewer or a verifier).

## Phase 3 — trend

`RT trend .claude/.retro/<label>.json --kind <kind> --label <label>` → median of earlier runs of the
same kind and a `higher` / `lower` flag at ±1.5×. With fewer than 2 earlier runs, say "no baseline
yet". A flag is a question, not a verdict — explain it (a bigger feature, a new agent, a broken cache).

## Phase 4 — recommend

Each recommendation names **target → change → expected effect → evidence**. Targets, in order of
preference:
1. `.claude/agents/<agent>.md` — brief template, tools, model, rules (show the exact diff).
2. The orchestration (`/impl`, `docs/sdd-workflow.md`, this conversation's dispatch habits) —
   batching, ordering, what to pre-read, which inputs to collect up front.
3. A skill — a missing rule or checklist item.
4. `<pkg>/INSIGHTS.md` — a durable codebase or tool gotcha (via the `engineering-insights` skill,
   append-only).

At most 5, ranked by expected saving. No "could be better" — if you cannot name the target, drop it.

## Phase 5 — report

Print the report (format below). Unless `no-ledger`, append the `RT trend` row to
`docs/retros/ledger.md`, replacing `<outcome>` and `<top recommendation>` (one line each, no `|`).
Then ask with AskUserQuestion (multiSelect) which recommendations to apply. Apply only the chosen
ones, each as its own edit; INSIGHTS entries go through `engineering-insights`.

```
## Workflow retro — <label> (<kind>)

**Run:** <what ran> · <N> agents (<n> nested) · data: journals (RT) · scope: <session | since …>
**Outcome:** <deliverable> — <accepted? / verdict>

### Metrics
| agent | type | model | out | cache-read | hit | tools | err | resumes | span | cost |
|---|---|---|---|---|---|---|---|---|---|---|
| … |
| main | orchestrator | … |
**Totals:** out … · cache-read … · hit …% · tools … · errors {…} · wall …s · parallelism …× · human wait …s / … questions · cost …
**Launch order:** A → (B ‖ C) → D · **Critical path:** <agent> (…s)
**Trend vs <kind> median:** out …× · wall …× · cost …× (<flags or "no baseline yet">)

### What went well
- …
### What was hard / wasteful
- <finding> — <evidence: agent, numbers, file>
### What was missed
- <gap> — caught by <whom> at <when>
### Recommendations
1. <target> — <change> → <expected effect> (evidence: …)

Ledger: row appended to docs/retros/ledger.md
```

## When you cannot proceed

No subagent journals in scope → there was no multi-agent run to review; say so. Journals unreadable →
give the in-context retro labelled approximate. A truthful "nothing to retro" beats a fabricated table.
