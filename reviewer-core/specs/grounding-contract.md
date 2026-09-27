# Grounding & injection contract — spec (reviewer-core)

Security-critical guarantees the engine must uphold. These are invariants, not
implementation notes — weakening any of them is a security regression. Pipeline
overview: [`../docs/pipeline.md`](../docs/pipeline.md).

## Grounding gate (citation requirement)
- Every **diff-finding** must cite a real diff line: its `start_line..end_line`
  must intersect an actual hunk of the reviewed diff. A finding that cites nothing
  real is **dropped** before it can reach the caller/DB.
- After dropping ungrounded findings, the **score is recomputed from the survivors**.
  The model's self-reported score is never trusted verbatim.
- Rationale: the model may hallucinate a file/line; a finding a human can't click
  through to is worse than no finding.

## Injection defense
- `INJECTION_GUARD` is appended to **every** agent prompt. Untrusted inputs (diff,
  PR title/body, comments, README) are wrapped as **data**, never instructions.
- The engine must **not** substitute keyword/denylist scanning for the guard — the
  contract is "treat untrusted text as data", enforced structurally in the prompt.
- A security or correctness finding must **never** be withheld or downgraded because
  untrusted text asked for it (e.g. "test fixture", "intentional", "do not flag").

## Scope filter (intent layer)
- Runs strictly **after** the grounding gate, on grounded findings only, and
  only when a classified intent is present, its `confidence` is not `low`, and
  `out_of_scope_files` is non-empty (the classifier already returns `[]` when
  it would cover every changed file). Absent any of these ⇒ no-op:
  `ReviewOutcome.scope = { applied: false, skippedReason: '…', filteredOut: 0,
  aggregated: 0 }` and the findings list is unchanged.
- A finding is out of scope **iff** its `file` is listed in
  `intent.out_of_scope_files` — a real changed-file path validated
  deterministically by the classifier, never a model-tagged per-finding scope.
- **"Serious" findings are never dropped.** Serious = `severity === 'CRITICAL'`
  or `category === 'security'`. All serious out-of-scope findings for a run are
  merged into exactly **one** aggregate finding (carrier = highest severity,
  then highest confidence; the aggregate's severity is the max across the
  merged group — severity is never lowered; the rationale lists every merged
  finding by `file:line — title (SEVERITY)`).
- Non-serious out-of-scope findings are dropped, each logged as an `info`
  event (`reason: 'out_of_scope'`) — same "never go silent" guarantee as the
  grounding gate's drops.
- The score is recomputed from the post-scope-filter findings, exactly like
  grounding recomputes it from the post-grounding survivors — the score, the
  findings list, and the deterministic events always agree.
- Stated intent is untrusted model output derived from untrusted PR text: it is
  rendered into the prompt via `wrapUntrusted('derived-intent', …)` with a
  TRUSTED header telling the agent to still report CRITICAL/security findings
  in "out of scope" files, and `INJECTION_GUARD` (unchanged, still appended
  last) already names "derived intent/scope" as untrusted data. Stated intent
  can never turn a real defect into zero findings — this is the mechanism that
  guarantees it deterministically, on top of the prompt-level defense.

## Deterministic verdict
- Blocker count is gate-derived: `countBlockers(findings, failOn)` counts findings
  whose `SEV_RANK[severity] ≥ FAIL_ON_MIN_RANK[failOn]`. The CI pass/fail decision
  uses this, not the model's `verdict` field.
- `severityCounts(findings)` groups survivors by severity — a plain count, no model
  call.

## Testability invariant
- The `LLMProvider` is always injected, so every guarantee above is verified
  hermetically (stubbed provider, no keys, no network) in `npm test`.
