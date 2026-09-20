# Insight examples — vague vs useful

The rule: an entry must be actionable **"cold"** — a future agent reads it and
knows what to do or avoid, without re-investigating. Generalize the learning;
lead with the *why*; cite `file:line`.

## Input → output pairs

**Input:** "`Promise.all()` blew up while ingesting a big repo."
❌ `- Promises can be tricky`
✅ `- 2026-09-18 — Promise.all() on the ingest pipeline times out past ~30 items; use Promise.allSettled() batched by 10 (server/src/modules/repo-intel/ingest.ts:42).`
→ **What Doesn't Work**

**Input:** "Spent an hour before realizing cart state must be shared."
❌ `- be careful with async state`
✅ `- 2026-09-17 — ALWAYS keep checkout state in the Zustand cartStore (client/src/_components/Checkout/cartStore.ts); 3 components share the cart, local state desyncs it.`
→ **Codebase Patterns**

**Input:** "Migrations didn't run and pgvector was missing."
❌ `- remember to migrate`
✅ `- 2026-09-16 — Migrations are NOT applied on boot; run pnpm db:migrate (pgvector enabled by 0000) before any vector query, or search silently returns empty.`
→ **Recurring Errors & Fixes**

**Input:** "The OpenRouter client kept dropping the score."
❌ `- grounding is important`
✅ `- 2026-09-15 — NEVER trust the model's self-reported score; groundFindings drops any finding without a real diff-line citation and recomputes the score from survivors (reviewer-core/src/grounding.ts:60). Weakening this is a security regression.`
→ **What Works**

**Input:** "e2e flow 04 was flaky on a fresh DB."
❌ `- tests are flaky`
✅ `- 2026-09-14 — e2e flows 02/04/05 assume the demo repo (acme/payments-api, PR #482) is the ONLY repo; run the hermetic runner — a shared dev DB makes them nondeterministic.`
→ **What Doesn't Work**

**Input:** "Zod route validation surprised me."
❌ `- validation is set up`
✅ `- 2026-09-13 — Routes declare zod params/body; invalid input returns 422 before the handler. Do NOT hand-roll Schema.parse(req.body) — it double-validates and bypasses the 422 path (server/src/modules).`
→ **Tool & Library Notes**

## Session Notes example

```
### 2026-09-18
Wired the repo-intel ingest to batch embeddings. Discovered the OpenRouter
provider rate-limits at 20 req/s — added allSettled batching. Open: whether the
tokenizer adapter should cache per-file (see Open Questions).
```
