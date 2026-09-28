# Intent layer — spec (server)

Before a review runs, a cheap flash model classifies **why** a PR was opened and
**which** changes are in scope. The result is stored per PR (with head-SHA
staleness), shown as an Intent card on the PR page, injected into the reviewer
prompt, and used to deterministically filter out-of-scope findings — keeping
exactly one signal for a *serious* out-of-scope problem. Engine side (classifier,
prompt injection, scope filter):
[`../../reviewer-core/specs/grounding-contract.md`](../../reviewer-core/specs/grounding-contract.md).
Pairs with [`review-flow.md`](./review-flow.md).

```
extract references (code)  ──►  resolve sources (issue/doc/link)  ──►  classify (1 model call)  ──►  persist  ──►  scope filter (review path)
```

## Decisions (locked)

| # | Decision | Consequence |
|---|---|---|
| D1 | New module `modules/intent/` owns `pr_intent` | Mirrors `conventions`; dead `reviews` helpers (`upsertIntent`/`getIntent`) are removed once the review path stops needing them |
| D2 | Classifier + scope filter live in `reviewer-core` (pure) | Server only resolves sources and persists; the classifier is reusable by the CI runner |
| D3 | Out-of-scope is decided **per changed file**, deterministically | `out_of_scope_files` is validated against the real changed-file list in `reviewer-core`; never a model-tagged `scope` on each finding |
| D4 | "Serious" = `severity === 'CRITICAL'` or `category === 'security'` | All serious out-of-scope findings collapse into ONE aggregate finding (severity never lowered); non-serious out-of-scope findings are dropped + logged |
| D5 | Confidence is a clamped enum `high\|medium\|low`, never the model's raw self-report | A short body with no resolved issue/plan/spec ⇒ `low`; any unresolved source ⇒ ≤ `medium`; empty `in_scope` ⇒ `low` |
| D6 | Exactly six cheap sources, no diff bodies | PR title, PR body (capped), a linked issue (`closes/fixes/resolves #N`, same repo), changed files + hunk **headers** only, a plan/spec repo doc at the PR head SHA, an allowlisted external link |
| D7 | Reads never call a model | `GET /pulls/:id/intent` returns the stored row + computed `stale`; only `POST` classifies, synchronously |
| D8 | Review auto-computes intent when missing/stale | Reused on a matching head SHA; a classification failure never fails the review — it proceeds without intent |
| D9 | Default model is a cheap OpenRouter flash model (`review_intent` feature) | Configurable in Settings → Models, same mechanism as `conventions`/`onboarding` |
| D10 | One row per PR (upsert), no history | `confidence` is a text enum without a CHECK constraint, following the `conventions` precedent |
| D11 | Intent cost is stored on `pr_intent.api_cost_usd` only | Not added to the PR-list cost totals |

## Data model

`pr_intent` (`server/src/db/schema/reviews.ts`, migration `0014_intent_layer.sql`):
`pr_id` (PK, FK → `pull_requests` cascade), `intent` (text, the summary), `in_scope`/
`out_of_scope` (jsonb `string[]`), `head_sha` (text, **null ⇒ stale**, legacy or
never-classified rows), `confidence` (text enum `high|medium|low`, default `low`),
`missing_context`/`out_of_scope_files` (jsonb `string[]`), `sources` (jsonb
`IntentSource[]`), `provider`/`model` (text, nullable), `prompt_tokens_est`/
`tokens_in`/`tokens_out` (int, nullable), `api_cost_usd` (double precision,
nullable — **real cost only**), `created_at`/`updated_at` (timestamptz).
PK-only access, no extra index.

## Contracts (`@devdigest/shared`, both vendored copies, `contracts/review-api.ts`)

`IntentConfidence` (`high|medium|low`) · `IntentSourceKind` (`pr_title|pr_body|
file_list|github_issue|repo_doc|external_link`) · `IntentUnresolvedReason`
(`not_found|forbidden|no_credentials|fetch_failed|timeout|not_allowlisted|
unsupported_content|repo_not_cloned|invalid_ref|limit_exceeded`) ·
`IntentSource { kind, ref, title, status, reason, chars, truncated }` ·
`PrIntentRecord` (`Intent.extend({...})`, the persisted row) · `PrIntentState
{ pr_id, current_head_sha, stale, intent }` (GET/POST response) ·
`IntentForReview { intent, in_scope, out_of_scope, out_of_scope_files, confidence }`
(what the review engine consumes).

`ref` conventions: `'title'` for `pr_title`, `'body'` for `pr_body`, `'files'` for
`file_list`, `'#N'` for `github_issue`, the repo-relative path for `repo_doc`, and
a **redacted** URL (`domain/redact.ts::redactUrl` — no query/fragment/userinfo)
for `external_link`. `title` is non-null only for a resolved `github_issue`.

## API

| Method | Path | Params | Body | 200 | Errors |
|---|---|---|---|---|---|
| GET | `/pulls/:id/intent` | `IdParams` | — | `PrIntentState` | 404 `not_found` |
| POST | `/pulls/:id/intent` | `IdParams` | none | `PrIntentState` (fresh) | 404 `not_found` · 422 `model_not_configured` · 502 `intent_classifier_failed` (`details: { provider, model }`, never prompt text) · 429 (10/min) |

Concurrent `POST`s for the same PR share one in-flight classification
(`IntentService`'s single-flight map keyed by `prId`) — never a 409.

## Sources → classify

1. **Extract references** (`domain/references.ts::extractReferences`, pure, no
   I/O): from the PR body + changed-file list, pull deduped/capped candidates —
   `closes/fixes/resolves #N` issue refs (same repo only), plan/spec doc paths
   (a same-repo `/blob/<ref>/<path>` link or a bare repo-relative path with a doc
   extension in the body, or a changed file matching `docs/plans/**`/`**/specs/**`),
   and every other `https://` URL as a link candidate.
2. **Resolve each candidate** (`IntentService`, `server/src/modules/intent/service.ts`):
   - *Issue* → `container.github().getIssue`; no token ⇒ `no_credentials`; 404 ⇒
     `not_found`; 401/403 ⇒ `forbidden`; else ⇒ `fetch_failed`/`timeout`
     (`SOURCE_TIMEOUT_MS`).
   - *Repo doc* → `isSafeRepoPath` first (else `invalid_ref`), then `clonePath`
     required (else `repo_not_cloned`), then `GitClient.readFileAt(repo, headSha,
     path)` (missing ⇒ `not_found`).
   - *External link* → allowlist check FIRST (`domain/external.ts::isAllowlistedHost`
     against `config.intentLinkAllowlist`, else `not_allowlisted`), then the
     SSRF-safe `UrlFetcher.fetch` (only the first `MAX_EXTERNAL_REFS` of the
     found links are fetched; the rest ⇒ `limit_exceeded`); a non-markdown/
     plain/html content-type ⇒ `unsupported_content`; HTML is converted to text
     (`htmlToText`, scripts/styles stripped); empty resulting text (e.g. a
     JS-rendered page) ⇒ `fetch_failed`.
   - Nothing is ever fabricated: a candidate that cannot be resolved becomes an
     `unresolved` entry (`{ kind, ref, reason }`) — visible to the model only as
     `ref (reason)`, never invented content — and confidence is capped accordingly.
3. **Classify** (`reviewer-core::classifyIntent`) — one structured-output call
   (`json_schema`, `maxRetries: 1`, `temperature: 0`). The classifier applies its
   own deterministic confidence ceiling and sanitizes `out_of_scope_files` against
   the real changed-file list; see `grounding-contract.md`.
4. **Persist** — `IntentRepository.upsert` (`updated_at = now()`, `created_at`
   kept). `sources[]` is built from the classifier's per-section/per-document
   char counts (`ClassifyIntentResult.sections`/`documentChars`) plus one entry
   per resolved/unresolved issue and link — never from raw content.

## Review integration (`modules/reviews`, see `review-flow.md`)

`IntentForReviewPort.ensureForReview(workspaceId, prId, { diff, logger, progress })`
reuses the stored intent when `head_sha` matches the PR's current head
(`domain/staleness.ts::isStale`); otherwise it classifies once per run. It
**never throws** — any failure (including a stale/missing PR row) resolves to
`{ status: 'unavailable', reason }` so the review proceeds without intent.

## Observability

- `intent.classified` (info): `prId`, `headSha`, `provider`, `model`,
  `sections`, `promptTokensEst`, `tokensIn`/`tokensOut`, `apiCostUsd`,
  `confidence`, `modelConfidence`, `sources` (kind/ref/status/reason/chars only,
  via `domain/redact.ts::sourceLogView`), `durationMs`.
- `intent.failed` (warn): `prId`, `provider`, `model`, `code` (`model_not_configured`
  or `intent_classifier_failed`).
- **Never logged:** PR/issue/doc body text, diff or hunk lines, the assembled
  prompt, API keys. URLs are always redacted (no query/fragment/userinfo) before
  they reach a log line, `sources[].ref`, or the persisted row.

## Invariants

- Reads (`GET`) never call a model; `POST` is the second (and only other)
  endpoint in this codebase that does — see the amended invariant in
  `review-flow.md`.
- A source that cannot be resolved is recorded as `unresolved` with a reason
  code and contributes zero characters to the prompt — never fabricated text.
- Confidence is always the deterministic clamp, never the model's raw
  self-report (`modelConfidence` is logged for comparison, not persisted).
- `out_of_scope_files` only ever contains paths that are actually in the diff
  (enforced in `reviewer-core`, not here).
- `intent`'s own `ports.ts` never imports an adapter or another module's
  internals: `IntentUrlFetch` (a local structural subset of `UrlFetcher`) is
  wired to the real `HttpUrlFetcher` in `container.ts`; `loadDiff` is
  re-implemented inline in `container.ts` (not imported from `reviews/diff-loader.ts`,
  which type-imports `Container` itself — importing it would close a
  `container.ts → diff-loader.ts → container.ts` cycle, confirmed via
  `pnpm exec depcruise`).

## Testing

Deferred to a later `test-writer` pass (this iteration ships the implementation
only — see the plan's status line). Planned coverage, per `docs/plans/intent-layer.md`
§6: `intent-domain.test.ts` (reference extraction, path safety, allowlist,
`htmlToText`, redaction), `intent-repository.it.test.ts` (upsert keeps
`created_at`, workspace scoping), `intent-service.test.ts` (source matrix,
error codes, single-flight, log canary), `intent-routes.test.ts` (`app.inject`
+ `MockAuthProvider`), `intent.it.test.ts` (end to end against Postgres).
