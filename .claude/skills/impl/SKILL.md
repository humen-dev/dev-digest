---
name: impl
description: "Executes an APPROVED DevDigest implementation plan (docs/plans/<slug>.md) end to end: Wave 0 in the main session, implementer waves by Kind, plan-verifier after every wave, a review loop (architecture · bugs · security when touched) with fix rounds routed to the owning unit, a final re-verify and /pr-self-review. Spec and plan are written separately and manually (spec-creator, implementation-planner) — this command only builds. Invoke only as /impl <plan path | slug> [notes] [design images], or /impl resume <slug>."
argument-hint: "<plan path | slug> [notes…] [design.png…] [--strict] [--no-bugs] | resume <slug>"
disable-model-invocation: true
---

# /impl — build an approved plan

You are the **orchestrator**. Subagents cannot start subagents, so every agent
below is started by you, and every commit is made by you. Spec writing
(`spec-creator`) and planning (`implementation-planner`) are **not** part of this
command — they run manually before it.

Tool: `node .claude/skills/impl/scripts/plan-tools.mjs` (below: `PT`) —
`waves <plan>`, `unit <plan> <U-id>`, `owner <plan> <file…>`,
`state get|set <slug> key=value…`. Run state and saved reports live in
`.claude/.impl/<slug>/` (git-ignored).

## Hard rules

1. **The plan is the contract.** Never edit the plan, a spec, `AGENTS.md` or
   `INSIGHTS.md`. A needed change to scope or §3 contracts → stop and tell the
   user to update the plan via `implementation-planner`.
2. **Commits yes, publishing no.** Commit after Wave 0, every wave and every fix
   round. Never push, open a PR, `--no-verify`, amend, rebase or reset. On `main`
   create `impl/<slug>` first. Commit messages end with the session's attribution
   trailer.
3. **Stage exactly what was reported.** Stage the files listed under *Changed* in
   the implementer reports (plus your own Wave 0 / orchestrator files). Any other
   modified or untracked file → find out who wrote it before committing.
4. **Reports are claims.** Never mark a unit done on an implementer's word — the
   plan-verifier decides.
5. **Context hygiene.** Save every subagent report to
   `.claude/.impl/<slug>/<step>.md` (e.g. `w1-verify.md`, `r2-arch.md`) and pass
   **paths** to later agents (`previous`), not pasted reports. In chat keep one
   line per agent: verdict + counts.
6. **Budgets.** ≤ 2 fix rounds per wave, ≤ 2 completeness rounds, ≤ 3 review
   rounds. Over budget → stop and ask the user (AskUserQuestion: accept as is /
   I fix it manually / one more round).
7. **Models.** `plan-verifier`, `architecture-reviewer`, implementers: their own
   (sonnet). `security-reviewer` and `pr-review-toolkit:code-reviewer`: pass
   `model: "sonnet"`. With `--strict` only the final `scope=all` verification
   runs with `model: "opus"`. `test-writer` is not used — tests belong to the
   owning unit.

## Arguments

- First argument: plan path or slug (`intent-layer` → `docs/plans/intent-layer.md`).
- `resume <slug>` → *Resume* below.
- Image paths (`.png`, `.jpg`, `.jpeg`, `.webp`) → **designs**: given to
  `implementer-ui` units only ("match these designs; the plan wins on behaviour").
- `--strict`, `--no-bugs` → flags (rule 7; `--no-bugs` skips the bug reviewer).
- All remaining text → **notes**: appended to every implementer prompt as
  *Orchestrator notes (subordinate to the plan)*. Before Wave 0, check them
  against the plan: if a note changes scope, behaviour or a §3 contract, stop and
  ask — do not start.

## Phase 0 — intake

1. `PT waves <plan>`. Fails (free-form plan, no unit blocks) → stop: `/impl` needs
   the template shape; suggest re-planning with `implementation-planner`.
2. Header `Status` must contain `approved` (or `in-progress` when resuming).
   Otherwise stop and ask the user to approve the plan first.
3. `git status --porcelain` must be clean. Dirty → stop and ask (never stash).
4. Branch: on `main` → `git switch -c impl/<slug>`.
5. `PT state set <slug> plan=<path> phase=wave0 base=<git rev-parse HEAD> wave=0 notes=<…> designs=<[…]> flags=<[…]>`.
6. Tell the user in ≤ 5 lines: waves, units per wave with agent, notes/designs
   accepted. Then proceed without waiting.

## Phase 1 — Wave 0 (you)

Implement every Wave-0 unit and every unit `PT` marks `orchestrator` *in its
wave* yourself (contracts in every vendored copy, schema + migration via
`pnpm db:generate --name …`, dependencies via the package manager, shared
registries, `.claude/**` / docs / tooling units). Read the unit block with
`PT unit`, follow it exactly, apply the skills its files need (read the skill's
`SKILL.md`). Check with `node scripts/agent-check.mjs <pkg> <files>` per package.
Commit `feat(<slug>): wave 0 — <short>`. `PT state set <slug> phase=wave wave=1`.

## Phase 2 — waves 1…N

For each wave, in order:

1. **Launch** one agent per non-orchestrator unit **in one message** (parallel in
   multi-agent plans; one at a time, in plan order, in single-agent plans). Agent =
   the `agent` column of `PT waves`. Prompt:

   ```
   plan: docs/plans/<slug>.md
   unit: U<n>
   mode: build
   Unit block (from plan-tools — your copy of the plan; read §3 only by the line range given):
   <output of PT unit <plan> U<n>>
   [Orchestrator notes (subordinate to the plan): <notes>]
   [Designs (ui only): <paths> — Read them; the plan wins on behaviour]
   Reply in Ukrainian.
   ```

2. **Wait for all**, save each report (`w<k>-U<n>.md`). Any `BLOCKED:` → resolve
   it yourself if it is orchestrator work (missing dependency, a Wave-0 contract
   gap that the plan's §3 already specifies), else stop and ask.
3. **Commit** `feat(<slug>): wave <k> — U<a>, U<b>` (rule 3).
4. **Verify:** `plan-verifier` with `plan`, `scope: U<a>,U<b>,…` (the wave's
   units, compact report). Save `w<k>-verify.md`.
5. **FAIL / INCOMPLETE** → group the not-MET rows by unit, launch that unit's
   agent with `mode: fix` and the rows as `findings` (ID, file:line, quoted
   requirement), all units in parallel. Commit `fix(<slug>): wave <k> verify round <r>`,
   re-run `plan-verifier` with `previous: .claude/.impl/<slug>/w<k>-verify.md`.
   NOT VERIFIABLE rows that need Docker / a running stack are not a FAIL for this
   loop — collect them for Phase 5.
6. PASS → `PT state set <slug> wave=<k+1>`.

## Phase 3 — completeness

`plan-verifier` with `scope: all` (spec `S<NN>-*` rows included; `--strict` →
`model: "opus"`). Save `final-verify.md`. NOT MET / PARTIAL rows → map to the
owning unit (`PT owner` on the cited files, or the row's unit id), fix rounds as
in Phase 2 step 5. A spec row no unit covers (*plan gap*) is **not** given to an
implementer: list it for the user — it goes back to `implementation-planner` for
a new wave. `PT state set <slug> phase=review round=1 reviewBase=<HEAD sha>`.

## Phase 4 — review loop

**Round 1 — full review, in one message:**

- `architecture-reviewer` — `range: <state.base>..HEAD`, `plan: <path>`.
- `pr-review-toolkit:code-reviewer` (`model: "sonnet"`; skip with `--no-bugs`):
  > Review ONLY for correctness bugs in `git diff <state.base>..HEAD`: logic
  > errors, wrong edge-case handling, races, null/undefined paths, swallowed
  > errors, broken error contracts. Not style, placement or best practice. The
  > intended behaviour is the plan `<path>` and its Requirements source. Each
  > finding: ID `B-<k>`, severity CRITICAL | WARNING | SUGGESTION, file:line,
  > evidence (≤2 lines), the failing input/state, the expected behaviour.
  > Confidence ≥ 80 only; zero findings is a good answer.
- `security-reviewer` (`model: "sonnet"`) — **only if** the diff touches a route
  (`server/src/modules/*/routes.ts`), request input or Zod schemas at the edge,
  outbound fetch/URLs, filesystem paths, secrets/env, LLM prompts
  (`reviewer-core/src/prompt.ts`, anything building prompt text) or rendering of
  untrusted PR/issue/repo text. Check with `git diff --name-only` + a grep of the
  diff for `fetch(`, `process.env`, `readFile`, `prompt`, `dangerouslySetInnerHTML`.
  `range: <state.base>..HEAD`, `plan: <path>`.

Save `r<k>-arch.md`, `r<k>-bugs.md`, `r<k>-sec.md`.

**Triage (you):**

1. Collect findings; drop exact duplicates across reviewers (same file, overlapping
   lines, same problem — keep the higher severity, note both IDs).
2. **CRITICAL + WARNING → fix.** SUGGESTION → the final summary list only.
   Pre-existing drift sections → ignore.
3. `PT owner <plan> <files of the findings>` → group by owning unit.
   `ambiguous` → the latest-wave candidate; `unowned` or `orchestrator` → you fix it.
4. Nothing to fix → leave the loop.

**Fix round:** one agent per owning unit, `mode: fix`, `findings` = its findings
(ID, severity, file:line, rule, expected result, the reviewer's target location),
all in one message; your own share in parallel. Save reports. Commit
`fix(<slug>): review round <k> — <IDs>`. `PT state set <slug> round=<k+1> roundBase=<sha before this commit>`.

**Re-review (round k+1):** only the reviewers that had CRITICAL/WARNING, each with
`previous: <its last report path>` and `range: <roundBase>..HEAD`.
For `pr-review-toolkit:code-reviewer` (no built-in re-review mode) say: "First,
for each finding in `<path>` state fixed / open with quoted evidence; then review
only `git diff <roundBase>..HEAD` for new bugs."
Findings an implementer marked `disputed` go to the reviewer in this pass; still
disputed after it → the user decides.

**Exit:** no open CRITICAL/WARNING → Phase 5. After round 3 with open ones → stop
and ask (rule 6).

## Phase 5 — finish

1. `plan-verifier` re-verify: `previous: .claude/.impl/<slug>/final-verify.md`,
   `range: <state.reviewBase>..HEAD`. FAIL → one fix round as in Phase 2 step 5,
   then re-verify once more; still FAIL → ask.
2. Plan §7 commands that need Docker or a running stack (`*.it.test.ts`,
   `./scripts/e2e.sh`, `pnpm db:migrate`): ask the user whether to run them now.
3. If the plan's Requirements source is a SPEC-NN spec: ask the user whether to
   mark it implemented now (same PR). On yes → `spec-creator` with
   `implemented SPEC-NN`, commit `docs(<slug>): SPEC-NN implemented`.
4. Invoke `/pr-self-review`. Blocked → fix as a normal fix round, re-run.
   Do **not** open the PR.
5. `PT state set <slug> phase=done`. Final summary (Ukrainian):
   - commits (`git log --oneline <state.base>..HEAD`), units built, rounds used;
   - verification verdict, review verdicts, `/pr-self-review` result;
   - open SUGGESTIONs (ID, file:line, one line), disputed findings and how they ended;
   - NOT VERIFIABLE rows and what would verify them;
   - next manual steps: open the PR; plan gaps → `implementation-planner`;
     optional `doc-writer`; `/engineering-insights` if something non-obvious surfaced.

## Resume (`/impl resume <slug>`)

`PT state get <slug>`, `git log --oneline <base>..HEAD`, `git status`. A dirty
tree means an interrupted wave or fix round: compare it with the last saved
reports — commit what a report claims and the verifier can check, otherwise ask.
Then continue at `phase` / `wave` / `round` exactly as above.
