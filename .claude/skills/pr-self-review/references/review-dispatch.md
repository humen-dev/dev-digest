# Phase 3 — dispatching the skill review

Phase 3 is the only phase the CLI cannot do: it needs a model to read a skill and
judge a diff against it. This file holds the dispatch template and the reduce
algorithm the parent applies to what comes back.

## Why one subagent per bundle

| Option | Why not |
|---|---|
| Inline in the main agent | A branch diff here is 300–2000 changed lines. Adding 4–6 skill bodies (`onion-architecture/SKILL.md` alone is ~150 lines before its references) plus phase 1–2 output consumes most of the window before a single finding is produced, and attention degrades exactly where precision matters. |
| One subagent per skill | Re-sends the same diff slice 5–6× — that many times the input tokens for the same coverage — and produces near-duplicate findings the reduce step then has to dedupe. |
| **One per bundle** | Each bundle is a coherent area with its own slice and its own 1–3 skills. Typically 2–3 subagents. |

Use `general-purpose`. `Explore` is search-shaped and `Plan` is planning-shaped;
neither returns structured findings.

**Map-split:** if a bundle's slice exceeds ~1500 changed lines, split it by
**whole files** (never mid-file) into at most 3 subagents and merge their findings
before handing them back — the same shape as `reduceReviews` in
`reviewer-core/src/review/reduce.ts`.

## Building a bundle's diff slice

`run.json` holds `base` and `routing.bundles[].files`:

```bash
git diff --no-color --unified=3 <base> -- <file1> <file2> ...
```

Untracked files in a bundle have no diff; pass their contents with a note that the
whole file is new.

## The subagent prompt

Use this verbatim, substituting the three placeholders.

---

You are reviewing part of a local change set **before** a pull request is opened.

**Read these skill files first, and only these:**
`<SKILL PATHS, e.g. .claude/skills/onion-architecture/SKILL.md>`

Read a `references/` file from one of them only if that SKILL.md's own index says
the task needs it. **Do not explore the repo** — everything you need is here.

**Review this diff against those skills:**

```diff
<BUNDLE DIFF>
```

**How to judge**

- Trace the changed code along its execution path: what the inputs are, which
  branches run, what it returns, who calls it. For each finding, state the concrete
  mechanism — which input triggers the wrong behaviour and what goes wrong.
- Flag **only** what this diff introduces or worsens. Pre-existing code is out of
  scope unless the change directly amplifies it.
- Precision over volume. No style nits. No "might be slow/wrong" without a
  mechanism. Nothing already handled elsewhere in the code.

**Severity — exactly these three**

- `CRITICAL` — once merged this can cause a security breach, data loss or
  corruption, incorrect results, a crash, or a broken contract callers depend on.
  **This is the only level that blocks the PR.**
- `WARNING` — a real problem worth fixing that does not block: a missed edge case,
  degraded behaviour, a maintainability or perf risk that bites at scale.
- `SUGGESTION` — a minor improvement; the change is safe without it.

Assign the severity you would defend to the author's face. **Do NOT inflate:** a
speculative issue ("might be", "could potentially", "if X isn't already handled
elsewhere") is at most `WARNING`, never `CRITICAL`. If you would dismiss your own
finding as a likely false positive, do not report it at all.

**Findings discipline**

Report only DISTINCT issues. Never list the same problem twice and never pad
toward a number — there is no minimum, target or maximum. **Zero findings is a
valid and good answer.** Every finding must cite a `file` and a line range that
exists in the diff above; anything else is dropped by the grounding gate.

**Return exactly one fenced ```json block, and nothing after it:**

```json
{
  "bundle": "<BUNDLE NAME>",
  "summary": "one or two sentences on what you checked",
  "findings": [
    {
      "id": "LLM-<bundle>-1",
      "severity": "CRITICAL|WARNING|SUGGESTION",
      "category": "bug|security|perf|style|test",
      "title": "short statement of the defect",
      "file": "repo/relative/path.ts",
      "start_line": 42,
      "end_line": 44,
      "rationale": "the mechanism: which input, what goes wrong",
      "suggestion": "the concrete fix",
      "confidence": 0.9
    }
  ]
}
```

Do **not** include a `score` or a `verdict` — the parent computes both.

---

## Reduce, in the parent

1. **Parse** each bundle's block. On failure, retry that bundle **once**; if it
   still will not parse, record it as `{ "bundle": "x", "error": "…" }`. The CLI
   turns that into `incomplete`, and an incomplete run is **never sealed**.
2. **Dedupe** on `(file, start_line, normalized title)`, keeping the highest
   severity.
3. **Ground** — drop any Phase-3 finding whose `[start_line, end_line]` does not
   intersect the changed-line index. Phase-1/2 findings are exempt, mirroring the
   `FULL_FILE_KINDS` exemption at `reviewer-core/src/grounding.ts:16`: a `tsc`
   error or a modified migration is real whether or not it sits in a hunk.
4. **Rescore** with the repo's weights and **derive** the verdict. A subagent's
   own numbers are discarded.

Steps 2–4 are the CLI's `report --phase3`. Step 1 is yours.

## What not to send a subagent

- The whole repo diff — only its bundle's slice.
- Skills not routed to that bundle.
- The phase 1/2 findings. They are already decided; showing them invites the model
  to restate them as its own.
