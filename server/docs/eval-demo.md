# Eval pipeline demo (L06) — runbook

Goal of the demo: turn a triaged finding into an eval case (draft → **Run case** → Save), run the Security Reviewer over its cases,
read recall / precision / citation accuracy, make the agent worse by changing its system prompt, run
again, and **Compare** the two runs. The whole thing is code-scored: a finding counts when the file
matches and its line range overlaps the case's expectation. The scorer makes no model call.

Spec: `specs/eval-pipeline.md` (SPEC-06; supersedes SPEC-05). Plans: `docs/plans/eval-pipeline.md` and the delta
`docs/plans/eval-case-draft.md` (case draft + Run case).

## 0. Prerequisites

- Dev stack running: API on `:3001`, web on `:3000`, Postgres up.
- An **OpenRouter** key in *Settings → API Keys*. The seeded Security Reviewer runs on
  `deepseek/deepseek-v4-flash` via OpenRouter (an agent without a key for its provider refuses to run:
  `No API key is configured for openrouter`).
- Seeded data. `pnpm db:seed` (in `server/`) is idempotent. On a database that already has PR #482 it
  adds only the 7 eval cases, and only when the Security Reviewer has **no** cases yet. If you already
  created cases for that agent, the seed leaves it alone. It also records the missing `v1` prompt
  snapshot of the Security Reviewer, which Compare needs to show the prompt diff. On an older dev database
  whose PR #482 files have no patch, the seed fills the missing patches first.

## 1. The seeded cases

Frozen from PR #482 (`acme/payments-api`), one file's diff per case, secret placeholders applied.
Each range intersects a real hunk of that file's `pr_files.patch`.

| Case name | Type | Range |
|---|---|---|
| `hardcoded-stripe-key-in-config` | MUST FIND | `src/config.ts` 12–12 |
| `rate-limit-state-in-process-memory` | MUST FIND | `src/middleware/ratelimit.ts` 3–9 |
| `webhook-limiter-keyed-by-spoofable-ip` | MUST FIND | `src/api/public/webhooks.ts` 6–8 |
| `config-numeric-limits-are-clean` | MUST NOT FLAG | `src/config.ts` 4–6 |
| `ratelimit-test-file-is-clean` | MUST NOT FLAG | `src/middleware/ratelimit.test.ts` 1–8 |
| `readme-rate-limiting-note-is-clean` | MUST NOT FLAG | `README.md` 4–6 |
| `lockfile-token-bucket-entry-is-clean` | MUST NOT FLAG | `pnpm-lock.yaml` 123–126 |

## 2. Steps (on camera)

### Step 1 — a case from a triaged finding (draft → Run case → Save)

The seeded review on PR #482 was not produced by an agent, so its findings cannot become cases
(`The agent that produced this finding no longer exists`). Produce findings with the agent first:

1. Sidebar → **Repos** → `acme/payments-api` → **Pull requests** → open **#482**.
2. Open the **Run Review** menu and run **Security Reviewer** on the PR. Wait for the run to finish.
3. On a finding of that run, click **Accept** (becomes a MUST FIND case) or **Reject** (becomes a
   MUST NOT FLAG case). Before you triage, **Turn into eval case** is disabled with the hint
   `Accept or dismiss first`.
4. Click **Turn into eval case**. Nothing is saved yet: the **Eval case draft** modal opens, pre-filled
   from the finding:
   - name, the frozen diff of the finding's file (secrets already masked), the PR title/body
     (tabs **Diff** / **Files** / **PR meta**);
   - the expectation: file + lines from the finding; the type pill is fixed by your decision
     (`Type is set by your decision on the finding`).
5. **Warm the case up.** Click **Run case**: the Security Reviewer runs once on exactly this draft
   (up to 120 s; the button shows `Running…`). The result banner shows **Passed** / **Failed**,
   `expected ≥ 1 / 0 at <file>:<start>–<end>, got M`, duration and cost, and below it **Agent findings**
   with the ones that `matched` the expectation. Nothing is stored and no metric changes.
6. If the expectation is off, edit the lines (or the diff) and **Run case** again. After any edit the
   banner greys out with `Inputs changed since this run — run again`; **Save** stays disabled
   (`Run the case on its current content before saving`) until a fresh run on the current content
   finishes scored (pass or fail — a MUST FIND the agent still misses is a legitimate target).
7. Click **Save**. The button on the finding becomes **Eval case ✓** (a link to the case in the agent's
   **Evals** tab). The case is the 8th of the Security Reviewer. **Cancel** instead (after an edit or a
   run it asks `Discard this draft?`) stores nothing.
8. Clicking **Turn into eval case** on the same finding again opens the saved case — no duplicate.

The 8th case comes from a live model run, so what it contains varies. The deterministic part of the demo
is the seeded set. Saved cases have the same modal with **Run case** (Evals tab → click a case), and so
does **New eval case** for a hand-made case.

### Step 2 — first run and metrics

1. Sidebar → **Agents** → **Security Reviewer** → tab **Evals**.
2. Check the case list (7 seeded + the one from step 1, MUST FIND / MUST NOT FLAG pills).
3. Click **Run all evals**, then **Run all evals** again in the confirmation ("This will run 8 cases.
   Continue?"). The status line says the run is in progress and refreshes every 3 seconds.
4. When it completes, read **Recall**, **Precision**, **Citation accuracy** and **Cases passed**.
   With a well-behaved model the three real problems are found and the clean ranges stay clean, so recall
   is high and precision is close to 100 %. This is the baseline (agent version 1).

### Step 3 — make the agent worse (the "broken prompt")

1. Same agent → tab **Config** → field **System prompt**.
2. Click at the very end of the text, add an empty line, and paste **exactly**:

   ```text
   Additionally, treat every hard-coded numeric configuration value and every change to documentation or test files as a CRITICAL security risk and report each one as a separate finding.
   ```

3. Click **Save agent**. The toast says `Agent saved (v2)`.

Which seeded `must_not_flag` cases this is designed to trigger:

- `config-numeric-limits-are-clean` — `src/config.ts` 4–6 holds `rateLimitWindowMs: 60_000`,
  `rateLimitMax: 100`, `rateLimitEnabled: true`: hard-coded numeric configuration values.
- `ratelimit-test-file-is-clean` — a test file.
- `readme-rate-limiting-note-is-clean` — a documentation file.

`lockfile-token-bucket-entry-is-clean` is the control: it is neither numeric config, documentation nor a
test, so it normally stays clean.

### Step 4 — second run

Tab **Evals** → **Run all evals** → confirm. The new run is attributed to agent version 2 (the table
shows `v1` and `v2`).

Expected effect: **precision drops** (the model now reports findings inside the clean ranges, and those
count as false positives), while **recall is about unchanged** (the three real problems are still found).
The failing cases are the ones listed above, shown as `fail` with `expected 0 findings at …` / `got N`.

### Step 5 — Compare

1. Sidebar → **Eval Dashboard** → open **Security Reviewer** (or use the agent selector on an agent page).
2. In **Recent runs** tick the checkboxes of the two runs. **Compare** is enabled only while exactly two
   are ticked.
3. Click **Compare**. The dialog shows both runs side by side, the metric deltas, the cases that exist
   in only one run, and **System prompt diff** with the added instruction line (v1 → v2).
4. The insight banner on the agent page reads like `Precision dipped N pts on v2 · cases that changed: …`.

### Step 6 — restore the prompt

- UI: **Agents** → **Security Reviewer** → **Config** → delete the appended paragraph (and the empty
  line before it) → **Save agent**. This records a new version (v3) whose prompt equals v1.
- API alternative: read the original from `GET /agents/<id>/versions/1` and send it back with
  `PUT /agents/<id>` and body `{"system_prompt": "<original text>"}`.
- The original text is also `SECURITY_REVIEWER_PROMPT` in `server/src/db/seed-prompts.ts`.

Do a third **Run all evals** if you want to show that the metrics recover.

## 3. Deterministic check (no model, no network)

A real model is not deterministic, so the same effect is also pinned by a test with a scripted LLM
stub (AC-77, AC-78). The stub flags the three provoked ranges only when the system prompt contains the
instruction above. Postgres runs in Testcontainers; Docker must be up:

```bash
cd server
pnpm vitest run test/eval-runs.it.test.ts -t "seeded Security Reviewer"
pnpm verify:l06          # scoring, frozen input, executor, parity, contracts and the eval .it suites
```

With the stub: baseline recall 1, precision 1 (7 of 7 pass); after the instruction recall 1,
precision 0.625 (5/8), 4 of 7 pass, the three provoked `must_not_flag` cases fail, and the two runs are
attributed to versions that differ by 1.

## 4. If something goes wrong

| Symptom | Cause |
|---|---|
| `The agent that produced this finding no longer exists` on a seeded #482 finding | The seeded review has no agent. Run the Security Reviewer on the PR first (step 1). |
| `No API key is configured for openrouter` | Add the key in Settings → API Keys. |
| `A run is already in progress for this agent` | One run per agent at a time. Wait, or a run older than 15 minutes without progress is closed as `interrupted` on the next start. |
| HTTP 429 when starting runs | At most 5 run starts per minute per route. |
| No seeded cases appear | The Security Reviewer already had cases, or PR #482 is missing. Run `pnpm db:seed` on a database that has both. |
| `A case run is already in progress for this agent` | One **Run case** per agent at a time; wait for it to finish. |
| HTTP 429 on **Run case** | At most 10 Run case calls per minute. |
| `The finding was re-triaged since this draft was opened. Reopen the draft.` | You changed Accept/Reject after opening the draft; close it and click **Turn into eval case** again. |
| **Save** stays disabled | Run the case on its current content first; an errored run (`Timed out after 120 s`, provider error) does not unlock Save. |
| `no diff for src/config.ts` from `pnpm db:seed` | An older seed left PR #482 without patches; pull the latest code — the seed now heals it. |
