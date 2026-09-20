---
name: engineering-insights
description: Captures non-obvious engineering insights into the touched module's INSIGHTS.md (client, server, reviewer-core, e2e). Use during a session the moment you hit something a future agent would otherwise relearn — a gotcha, a working approach, a dead-end antipattern, a codebase convention, a tool/library quirk, a recurring error+fix, or an open question — and again at session end, on "wrap up" / "retro", or when /engineering-insights is invoked. Reads the existing file first, never duplicates, writes only substantial file-grounded entries, and is strictly append-only (never overwrites).
---

# Engineering Insights

Persist **non-obvious** engineering learnings into the touched module's
`INSIGHTS.md` so future sessions read them instead of re-deriving them. One skill,
one job — capture insights; do nothing else.

## Route to the right file

Write to the `INSIGHTS.md` of the module the task actually touched:

| Path touched | Target file |
|---|---|
| `client/**` | `client/INSIGHTS.md` |
| `server/**` (incl. `src/modules/repo-intel`) | `server/INSIGHTS.md` |
| `reviewer-core/**` | `reviewer-core/INSIGHTS.md` |
| `e2e/**` | `e2e/INSIGHTS.md` |

Shared/vendored code (`src/vendor/shared`) or a cross-cutting change → the module
most affected. If genuinely ambiguous, ask the user which module owns the insight.

## The 7 fixed sections

Every `INSIGHTS.md` uses these headers. Pick the one that fits; never invent new ones.

- **What Works** — an approach/solution that proved out here.
- **What Doesn't Work** — a dead end or antipattern to avoid. *Most valuable and
  most skipped — do not skip it.*
- **Codebase Patterns** — a convention or architectural decision worth reusing.
- **Tool & Library Notes** — a dependency quirk (version, flag, limit, gotcha).
- **Recurring Errors & Fixes** — an error seen more than once + its fix.
- **Session Notes** — a dated, concrete summary of a substantial session.
- **Open Questions** — something still unresolved, for the next session.

## Record format

Append a bullet directly under the matching section header, **newest on top**:

```
- YYYY-MM-DD — <insight, with file:line evidence>
```

Session Notes use a dated sub-heading instead:

```
### YYYY-MM-DD
<concrete summary of what was done and what was learned>
```

Rules for the text:
- **Actionable "cold"** — specific enough that an agent reading it later knows
  exactly what to do or avoid without re-investigating.
- **Generalize, don't log raw** — abstract the underlying learning, not the
  one-off event.
- **Lead with the why** in a clause, then the fix. For rule-shaped insights start
  with **NEVER** or **ALWAYS**.
- Cite evidence as `file:line` (clickable).

## MUST rules

- MUST **re-read the full target file first** and skip the entry if it (or an
  equivalent) is already there — no duplicates.
- MUST write **only something substantial and new**. If the session produced
  nothing that isn't already recorded, write **nothing**.
- MUST **append only** — never rewrite or delete an existing entry. Correct a
  stale entry by appending a new dated note.

## Non-destructive write contract (hard rule)

This skill is **append-only** and must never clobber existing content:

- **Re-read the target `INSIGHTS.md` immediately before writing** — its state may
  have changed since the session started.
- **Insert with an anchored `Edit`** that adds the new bullet under the correct
  `##` heading. **Never use the `Write` tool on an existing `INSIGHTS.md`** —
  `Write` replaces the whole file and would destroy prior content.
- **Preserve verbatim** the `# Insights` header, the preamble, every section
  heading, and every entry already in the file. New content is only ever *added*.
- **Corrections are additive** — supersede a wrong entry with a new dated note; do
  not rewrite or delete the old one.
- **Idempotent** — if an equivalent entry already exists, skip it (no duplicate,
  no rewrite).

## What NOT to write (anti-banality)

Skip it if it's obvious to anyone reading the code. Do **not** record:
generic programming knowledge · one-time issues · anything already in
`README`/`docs`/`CLAUDE.md` · verbose prose.

- ❌ "Promises can be tricky" → ✅ "`Promise.all()` on the ingest pipeline times
  out past 30 items — use `Promise.allSettled()` batched by 10 (`server/src/modules/repo-intel/ingest.ts:42`)."
- ❌ "be careful with async" → ✅ "checkout state always via Zustand
  (`client/src/.../cartStore.ts`) — 3 components share the cart; local state breaks it."

More pairs: [examples.md](examples.md).

## Capture checklist (4 categories)

While working, watch for one of these — it's the trigger for "is this worth an entry?":

- **Pattern** — a reusable approach that worked → *What Works / Codebase Patterns*
- **Mistake** — what failed and why → *What Doesn't Work / Recurring Errors & Fixes*
- **Decision** — an architectural choice + its reasoning → *Codebase Patterns*
- **Context** — a quirk, constraint, or terminology → *Tool & Library Notes*

## Workflow

Copy this checklist and work through it:

```
- [ ] 1. Gate check — was this session substantial?
- [ ] 2. Read the touched module's INSIGHTS.md
- [ ] 3. Draft ≤5 candidates, ranked by signal
- [ ] 4. Dedup against what's already there
- [ ] 5. Append automatically (append-only)
- [ ] 6. One-line summary
```

1. **Gate check.** Did the session produce something substantial — a problem
   solved, a decision made, a non-obvious discovery? If not → **write nothing**
   and stop.
2. **Read first.** Open the touched module's `INSIGHTS.md` before drafting
   anything.
3. **Draft ≤5 candidates**, ranked by signal (user corrections and gotchas
   highest; nice-to-know patterns lowest). Each candidate = the exact proposed
   line + its target section + `file:line` evidence.
4. **Dedup.** Drop any candidate already covered by an existing entry. If reality
   contradicts an old entry, add a new dated note that supersedes it — never edit
   the old one.
5. **Append** the survivors (automatic mode — no approval prompt). If nothing
   substantial survives gate + dedup, write nothing.
6. **Summary.** One line: what was written, to which file, what was skipped.

## Cadence & pruning

- Capture on sessions >30 min that hit a problem, decision, or discovery. Skip
  trivial edits.
- Cap **~30 entries per file** — beyond that, split by domain or prune.
- Prune periodically (human-initiated): drop entries for deleted code, consolidate
  near-duplicates, move resolved items out of Open Questions.

> Reliable automatic capture via a **Stop hook** is a later lab — this skill is
> description-triggered and slash-invoked.
