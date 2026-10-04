# <Feature name> — development plan

> Template for the `implementation-planner` agent. Copy to `docs/plans/<kebab-slug>.md` and fill
> every section; write "none" instead of deleting a section. A worked example of
> the shape is [`conventions-extractor.md`](./conventions-extractor.md).

| Field | Value |
|---|---|
| Status | draft · approved · in-progress · done |
| Goal | <one sentence: what the user can do after this ships — taken from the requirements, not invented> |
| Requirements source | <spec path(s) in `<pkg>/specs/` · Design brief · request> (input — this plan never edits it) |
| Execution mode | multi-agent (parallel waves) · single-agent (sequential pass) — chosen by the user |
| Packages touched | server · client · reviewer-core · e2e · shared (list only the touched ones) |

## 1. Context
What exists today (with `path:line` evidence), why it is not enough, and a short
summary of the requirements with a link to their source. Link the specs/INSIGHTS
entries you relied on. Do not restate or extend a spec here.

### Requirements review
Findings from the review (unclear / conflict / infeasible / untestable / gap) and
how each was resolved. Recommendations, each marked **accepted** or **rejected**
by the user. "none" if none.

### Decisions
Numbered, each with the alternative that was rejected and why.

### Open questions
Questions the user must answer before approval. "none" if none.

## 2. Affected modules
| Package | Touched? | Why / what changes | Architecture rule that applies |
|---|---|---|---|
| server | | | onion-architecture ring(s) |
| client | | | frontend-ui-architecture layer(s) |
| reviewer-core | | | grounding gate / INJECTION_GUARD untouched? |
| e2e | | | new/changed flow? |
| shared (vendored) | | | edited identically in every copy, Wave 0 only |

## 3. Contracts (the Interfaces every unit agrees on)
Exact Zod schemas / TypeScript types / HTTP endpoints (method, path, request,
response, error codes) / DB tables. Written as code, not prose. Implementers
must not change these — a unit that needs a different contract stops and
reports it as `BLOCKED:` in its result.

## 4. Work units
One block per unit. A unit is the smallest change that carries its own tests
and can be verified alone. **No two units in the same wave may own the same file.**

### U<n> — <short title>
| Field | Value |
|---|---|
| Kind | backend · ui · engine · e2e |
| Wave | 0 · 1 · 2 … |
| Depends on | U… (or "none") |
| Owns (create/modify) | exact paths, incl. tests |
| Must not touch | anything notable the unit might be tempted to edit |
| Consumes | contracts/units it reads from (§3 names) |
| Produces | contracts/symbols other units rely on |
| Checks | e.g. `server: pnpm typecheck · pnpm exec vitest run <file> · depcruise` |

**Steps**
1. …

**Acceptance criteria**
- [ ] observable behaviour, testable

## 5. Waves (execution order)
| Wave | Units | Runs | Why this order |
|---|---|---|---|
| 0 | contracts, schema + migration, shared registries | sequential, by the orchestrator | everything else builds on it |
| 1 | … | parallel | disjoint files |

In **single-agent** mode every wave runs `sequential` (one unit per wave, in
order); disjoint ownership across waves is not required.

Shared files that must belong to Wave 0 or to exactly one unit:
`server/src/modules/index.ts`, `server/src/db/migrations/NNNN_*.sql` (one
migration per wave), `client/src/lib/api.ts`, `client/messages/<locale>/*.json`,
`**/src/vendor/shared/**`, any `INSIGHTS.md` (implementers never edit these).

## 6. Test plan
Per package: unit tests, `*.it.test.ts` (DB-backed), client component tests,
e2e flows — and which unit owns each.

## 7. Verification (orchestrator, after merge)
Commands to run on the merged branch, then `/pr-self-review`.

## 8. Risks
What could go wrong, how it would show up, mitigation. Always check: migration
numbering, vendored-contract drift (pr-self-review DET-003 will flag
`src/vendor/shared` edits), depcruise baseline, security-sensitive paths.

## 9. Out of scope

### Spec follow-ups (owner: user / spec author)
Spec changes the accepted requirements need — never a work unit of this plan.
"none" if none.
