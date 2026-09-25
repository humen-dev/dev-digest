# Tuning: fast paths, the cache, accepted findings, gateFailOn

A gate people route around is worse than no gate. Everything here exists to keep
the gate fast enough and accurate enough to stay switched on.

## The docs-only fast path

If every changed path matches `gate.docsOnlyGlobs`, Phases 2 and 3 are skipped and
the run seals in ~2s, reported as `SKIPPED (docs-only)`. Phase 1 still runs —
DET-002 and DET-004 are precisely docs-shaped rules.

This is not a corner case. The `docs/agents-md-rename` branch is 56 files of
almost pure Markdown; without the fast path it would spend minutes on typecheck,
vitest and three subagents to find nothing.

The same list drives a second decision: **skills are code lenses**, so a Markdown
file is neither routed to a skill nor reported as unreviewed surface. Before this,
`e2e/specs/README.md` was being routed to `typescript-expert`.

## Unreviewed surface

Changed **code** files that matched no route are listed under *Unreviewed surface*.
`gate.unroutedIgnoreGlobs` suppresses paths where no skill could sensibly apply
(`.claude/**`, `docs/**`, `**/*.json`, `**/*.sql`). What is left is an honest list
of holes in the skill library — today, `server/.dependency-cruiser.cjs`.

## The incremental cache

The loop is *run → fix → run*, so the second pass must be cheap. There are two
caches, and they are stored differently for a reason.

### `configHash` — the shared invalidator

Both caches are keyed on it. It covers `routing.json`, `accepted.json`, the body
of every routed `SKILL.md`, **and the gate's own `scripts/*.mjs`**.

That last part is not decoration. A cache key must cover the code that *produces*
a result, not only its inputs: edit a parser in `checks.mjs` so it catches a
failure it used to miss, re-run with no source change, and a key without the
scripts would hand back the old `ok` — a stale pass sealed under the new logic's
name. This is the one place where a wrong answer can be **sealed**, so the rule
is: any doubt ⇒ full run.

### Phase 2 — per package, stored in `run.json`

A package's checks are reused when `configHash` matches, the base is unchanged,
the check passed last time, and every changed path under that package has an
unchanged content hash.

### Phase 3 — per bundle, stored in `phase3-cache.json`

Keyed on `(configHash, bundle, sliceHash)`, where `sliceHash` covers the exact
file list and content a subagent would be shown. A bundle whose slice has not
moved reuses its findings, re-grounded against the current changed-line index, so
a finding whose lines no longer intersect a hunk is dropped rather than kept.

This one is a **separate, accumulating store on purpose**. `run.json` is the
record of the last run, so using it as the cache means a run that misses erases
it: change a file, run, change it back, and the review already paid for is gone.
Keyed entries survive that round trip. The store keeps the 50 newest entries.

When only some bundles hit, the run reports which to dispatch and which not to
re-dispatch; when all hit, Phase 3 completes with no subagent at all and the run
seals directly — measured at **0.7s** for a full cycle on this repo.

`--no-cache` and `--full` bypass both.

## `accepted.json` — the false-positive valve

The repo already solved this shape once, in
`server/.dependency-cruiser-known-violations.json`: freeze what exists so a rule
can be adopted on a live codebase. The review side needs it for a blunter reason —
**one stubborn false-positive CRITICAL turns the gate into a permanent
`PR_SELF_REVIEW_BYPASS=1` habit**, and then it protects nothing.

```json
{ "key": "DET-012|server/src/platform/run-logger.ts|debug leftover",
  "reason": "structured run logging, intentional",
  "addedBy": "mykhailo", "addedAt": "2026-09-21" }
```

- **Key** = `<rule id>|<repo-relative POSIX path>|<normalized title>`. The title is
  lowercased, whitespace-collapsed and stripped of digits, so an accepted finding
  survives the code moving a few lines. A `MECH-` id drops its trailing ordinal
  (`MECH-TSC-server-3` → `MECH-TSC-server`); a `DET-nnn` keeps its number, because
  there the number *is* the rule.
- The report prints the acceptance key for every blocking Phase-1/2 finding, so
  accepting one is a copy-paste.
- **A `reason` is mandatory.** `addedBy` / `addedAt` are filled in automatically.
- Suppressed findings are **not silently dropped** — the report prints
  `Suppressed by accepted.json: N` with the ids.
- **Phase-3 findings may not be accepted.** A wrong LLM finding is fixed by
  tightening the routed skill or the code; freezing it would turn the baseline
  into a dumping ground and hide a skill that needs work.

Prune it periodically, the way `engineering-insights` caps INSIGHTS entries.

## `gateFailOn`

`gate.gateFailOn` mirrors `agents.ciFailOn` in the product (default `critical`).
It exists so the blocking threshold is configuration rather than code — a team
that wants `warning` to block changes one line instead of editing the CLI.

## Cost at a glance

| Situation | Time |
|---|---|
| Docs-only | ~2s |
| Phase 1 CRITICAL (fail fast) | ~1s |
| Full cold run | ~3–8 min, `server` vitest the long pole |
| Incremental re-run after a one-package fix | seconds |
| `--skip-mechanical` (CI just ran) | Phase 1 + Phase 3 only |
| The hook, non-matching command | ~137 ms |
