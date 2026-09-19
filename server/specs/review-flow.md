# Review flow — spec (server)

The contract for running a review on a PR and persisting the result. Behavioural
guarantees that must stay true regardless of implementation. Pairs with the
engine contract in
[`../../reviewer-core/specs/grounding-contract.md`](../../reviewer-core/specs/grounding-contract.md).

## Trigger
- Review is **manual** (or auto-trigger), never on PR import. `POST /pulls/:id/review`
  (optionally scoped to one agent) enqueues one **run per enabled agent** and
  returns `{ pr_id, runs: [{ run_id, agent_id, agent_name }], reviews }`.
- Import (`GET /repos/:id/pulls`) and read endpoints **never** run a model.

## Per-run lifecycle
1. A row is created in `agent_runs` (status `running`).
2. The diff + context are handed to `@devdigest/reviewer-core`, which returns a
   grounded `ReviewOutcome` (findings that survived the citation gate, a recomputed
   score, and `apiCostUsd`).
3. On completion the server persists a `reviews` row (`kind='review'`) with its
   `findings`, and finalizes the `agent_runs` row: `status='done'`, `score`,
   `findings_count`, `blockers`, `cost_usd` (real provider cost only, else `null`).
4. Failure/cancel → `status='failed'|'cancelled'`, `cost_usd=null`, `error` set.

## Determinism guarantees
- **Blockers are gate-derived, not model-reported.** `blockers = countBlockers(findings,
  ciFailOn)` using `SEV_RANK` — the CI verdict never trusts the model's self-reported
  verdict. See `reviewer-core/src/output/to-review.ts`.
- **Score is recomputed** from the findings that survived grounding, never taken
  raw from the model.
- Re-running an agent adds a **new** run; history is preserved (timeline shows every
  run). Findings surface per-run in the "Review runs" cards.

## Read endpoints (shape)
- `GET /pulls/:id/reviews` → `ReviewRecord[]` — persisted reviews with full
  `findings` (used by the detail page; powers per-run severity counters).
- `GET /pulls/:id/runs` → `RunSummary[]` — denormalized timeline rows (counts +
  cost, no findings).
- `GET /repos/:id/pulls` → `PrMeta[]` — list rows; aggregates `score` (latest
  review), `cost_usd` (sum of priced runs), and `findings` (across all review runs).

## Invariants
- No endpoint outside the review trigger performs a model call.
- Findings persistence and gate logic are security-critical — a finding without a
  real diff citation must not reach the DB.
