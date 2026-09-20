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

## Deterministic verdict
- Blocker count is gate-derived: `countBlockers(findings, failOn)` counts findings
  whose `SEV_RANK[severity] ≥ FAIL_ON_MIN_RANK[failOn]`. The CI pass/fail decision
  uses this, not the model's `verdict` field.
- `severityCounts(findings)` groups survivors by severity — a plain count, no model
  call.

## Testability invariant
- The `LLMProvider` is always injected, so every guarantee above is verified
  hermetically (stubbed provider, no keys, no network) in `npm test`.
