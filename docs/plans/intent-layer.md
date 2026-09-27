# Intent Layer — development plan

| Field | Value |
|---|---|
| Status | approved — iteration 1 (2026-09-27): **no new tests are written in this iteration**; §6 test rows and test files listed under "Owns" are deferred to a later `test-writer` pass. Every unit still runs the package's EXISTING checks (typecheck + existing test suites) and keeps them green. |
| Goal | Before a review runs, a cheap flash model classifies WHY a PR was opened and WHICH changes are in scope; the result is stored per PR (with head-SHA staleness), shown as an Intent card on the PR page, injected into the reviewer prompt, and used to deterministically filter out-of-scope findings (keeping exactly one signal for serious out-of-scope problems). |
| Packages touched | server · client · reviewer-core · e2e · shared (vendored, both copies) |

## 1. Context

### What exists today (verified)
- **Contract.** `Intent = { intent, in_scope[], out_of_scope[] }` (`server/src/vendor/shared/contracts/brief.ts:9-14`, same in `client/src/vendor/shared/contracts/brief.ts:9`), composed into `PrBrief` (`brief.ts:116-121`). `PrIntentRecord = Intent.extend({ pr_id })` (`server/src/vendor/shared/contracts/review-api.ts:59-61`) — exported, consumed nowhere.
- **Table.** `pr_intent` = `pr_id` (PK, FK → pull_requests cascade), `intent` text NOT NULL, `in_scope`/`out_of_scope` jsonb (`server/src/db/schema/reviews.ts:48-55`; `server/src/db/migrations/0000_init.sql:234`). No head SHA, confidence, sources, model, timestamps.
- **Dead persistence helpers.** `upsertIntent`/`getIntent` (`server/src/modules/reviews/repository/pull.repo.ts:47-68`, facade `server/src/modules/reviews/repository.ts:128-136`) have no callers.
- **No classifier exists.** `run-executor.ts` only mentions intent in comments (`server/src/modules/reviews/run-executor.ts:39,52,63,148,300`); pre-work is diff load only (`:95-105`). `reviewer-core/src/review/run.ts:22` says the engine does no intent I/O. `server/src/platform/run-logger.ts:7,16` anticipates "derive intent" as fanned-out pre-work.
- **Anti-injection guarantee already names intent.** `INJECTION_GUARD` treats "derived intent/scope" as untrusted data; stated intent can never turn a real defect into zero findings (`reviewer-core/src/prompt.ts:16-28`); appended last to every system prompt (`prompt.ts:90`). Spec `reviewer-core/specs/grounding-contract.md:16-22`. Grounding runs after reduce; score recomputed from survivors (`reviewer-core/src/review/run.ts:207-219`).
- **Feature model registered.** `review_intent` default `openai`/`gpt-4.1` (`server/src/vendor/shared/contracts/platform.ts:15-21,52-58`; mirror `client/src/lib/feature-models.ts:21-27`). Resolver `FeatureModelResolver.resolve` (`server/src/modules/settings/feature-models.service.ts:39`) = `container.featureModels` (`server/src/platform/container.ts:126`). Settings → Models already renders a picker per registry entry and stores openrouter choices (`client/src/app/settings/[section]/_components/SettingsView/_components/SettingsModels/SettingsModels.tsx:30-66`) — requirement 5 only needs a default change.
- **LLM path.** `OpenRouterProvider.completeStructured` already sends strict `json_schema` and loops `parseWithRepair` (`reviewer-core/src/llm/openrouter.ts:59-118`, `reviewer-core/src/llm/structured.ts:54-84`); real cost = `apiCostUsd` (`openrouter.ts:107-110`).
- **Closest sibling module:** `conventions` (narrow deps `server/src/modules/conventions/ports.ts:120-133`, one model call `service.ts:142-162`, wiring `container.ts:135-147`, rate-limited route `conventions/routes.ts:31-38`).
- **GitHub.** `container.github()` (`server/src/platform/container.ts:206`) returns a `GitHubClient`; `getIssue` exists (`server/src/vendor/shared/adapters.ts:171`, impl `server/src/adapters/github/octokit.ts:351`); Octokit's own linked-issue regex is loose and not persisted (`octokit.ts:126-135`).
- **Diff.** `loadDiff` (`server/src/modules/reviews/diff-loader.ts:12`) returns a `UnifiedDiff` — real `git diff base...head`, else reconstructed from `pr_files.patch` (`diffFromPrFiles`, `diff-loader.ts:33`). It is internal to `reviews` and takes the whole `Container`. **Tokenizer** `container.tokenizer` (`container.ts:181-185`).
- **PR data.** `pull_requests.head_sha`, `last_reviewed_sha`, `body` (`server/src/db/schema/pulls.ts:20-26`); `head_sha` refreshed only by list sync (`server/src/modules/pulls/routes.ts:66-73`), `body` only by detail fetch (`pulls/routes.ts:271-281`); `pr_files.patch` (`pulls.ts:36-45`).
- **UI.** Default tab `OverviewTab` (description only), results in `FindingsTab`; "Run review" switches to Findings (`client/src/app/repos/[repoId]/pulls/[number]/page.tsx:60,132,137-162`; `.../_components/OverviewTab/OverviewTab.tsx:11-22`). i18n `brief.block.intent` exists (`client/messages/en/brief.json:3`); only `en` locale. Icons `Check`, `X`, `AlertTriangle`, `RefreshCw`, `Link`, `FileText` exist (`client/src/vendor/ui/icons.tsx:20-61`). Hooks call `api` directly (`client/src/lib/hooks/conventions.ts`).
- **Tests.** `MockLLMProvider.structuredBySchema` (`server/src/adapters/mocks.ts:48-53,91`); review ITs inject only an `openai` mock (`server/test/reviews.it.test.ts:114-126`); `MockGitClient` (`mocks.ts:256-298`). e2e has no LLM, seeded PR #482 (`e2e/AGENTS.md:9,31`; `server/src/db/seed.ts:272-354`, head `a1b2c3d4e5f6`).
- **Enforcement.** `server/.dependency-cruiser.cjs` exists on this branch: cross-module only via `index|ports|types.ts` (`:146-158`), no container import outside routes/_shared (`:106-115`), ORM only in repositories (`:89-96`).
- **Invariant to amend.** `server/specs/review-flow.md:41-42` "No endpoint outside the review trigger performs a model call" — the new `POST /pulls/:id/intent` is a second deliberate trigger.

INSIGHTS relied on: server 2026-09-21 (route tests need `MockAuthProvider`), 2026-09-22 (plain row interfaces in ports.ts; no cross-module repository types), 2026-09-23 (inline port impls in container); client 2026-09-20 (hooks), 2026-09-23 (vendored drift, e2e strings, TS2742 in styles.ts); reviewer-core 2026-09-18, 2026-09-22.

### Call sequence
```mermaid
sequenceDiagram
    autonumber
    participant UI as PR page (IntentCard)
    participant API as intent routes
    participant SVC as IntentService
    participant SRC as Sources (pull_requests row, container.github() getIssue, loadDiff)
    participant CORE as reviewer-core classifyIntent
    participant LLM as OpenRouter flash model
    participant DB as pr_intent
    participant EXE as ReviewRunExecutor

    UI->>API: GET /pulls/:id/intent
    API->>SVC: getState(ws, prId)
    SVC->>DB: row + pull.head_sha
    SVC-->>UI: PrIntentState {intent|null, stale}
    Note over UI: read never calls a model

    UI->>API: POST /pulls/:id/intent (Detect / Re-detect)
    API->>SVC: detect(ws, prId, {logger})
    SVC->>SVC: single-flight per prId
    SVC->>SRC: title+body from pull_requests; closes/fixes #N -> getIssue; UnifiedDiff via loadDiff (or ctx.diff); plan/spec via readFileAt(head)
    SVC->>SRC: external https links: allowlisted host -> HttpUrlFetcher (SSRF-safe); else unresolved/not_allowlisted
    SVC->>CORE: classifyIntent(title, body, linked issues, plan/spec docs + external docs, files+hunk headers, unresolved)
    CORE->>LLM: completeStructured(json_schema + JSON-in-prompt, 1 repair retry)
    LLM-->>CORE: JSON
    CORE->>CORE: validate, clamp confidence, sanitize out_of_scope_files
    CORE-->>SVC: intent + section sizes + tokens + apiCostUsd
    SVC->>DB: upsert (head_sha = pull.head_sha, ...)
    SVC-->>UI: 200 PrIntentState | 422 model_not_configured | 502 intent_classifier_failed

    Note over EXE: POST /pulls/:id/review (existing)
    EXE->>EXE: load diff (existing)
    EXE->>SVC: ensureForReview(ws, prId, {diff, progress: runLog})
    alt intent.head_sha == pull.head_sha
        SVC-->>EXE: reused
    else missing or stale
        SVC->>SVC: detect(...)
        SVC-->>EXE: classified | unavailable(reason)
    end
    Note over EXE: failure never throws: review runs WITHOUT intent,<br/>Live Log line + trace.intent.status='unavailable'
    EXE->>CORE: reviewPullRequest({..., intent?})
    CORE->>CORE: prompt (## PR intent, untrusted) -> LLM -> reduce -> grounding (unchanged) -> scope filter -> score
```

### Decisions
1. **New server module `modules/intent/`** owns `pr_intent`, mirroring `conventions`; dead reviews helpers deleted in U6. *Rejected:* growing `reviews` (takes whole `Container`, `reviews/service.ts:33`, baselined drift).
2. **Classifier, injection and post-filter live in `reviewer-core`** (pure, injected `LLMProvider`, reusable by CI). Server does sources, persistence, logging. *Rejected:* classifier in `server/modules/intent/domain/` (forks studio vs CI).
3. **Keep field name `Intent.intent` as the summary.** *Rejected:* rename to `summary` (breaks `PrBrief` `brief.ts:117`, `server/test/contracts.test.ts:70`, both copies).
4. **Out-of-scope decided per FILE, deterministically:** classifier returns `out_of_scope_files` validated against the real changed-file list; a finding is out of scope iff its `file` is listed. Prompt also asks the model to focus in-scope (pre-gate). *Rejected:* model-tagged `scope` on each `Finding` (changes `Review` LLM schema for every agent; not deterministic).
5. **"Serious" = `severity === 'CRITICAL'` or `category === 'security'`** (`Severity` has no "high", `server/src/vendor/shared/contracts/findings.ts:11`). All serious out-of-scope findings collapse into ONE finding (carrier = highest severity, then confidence; severity never lowered; rationale lists every merged finding). Non-serious out-of-scope → dropped + logged. (Open question 3.)
6. **Filter runs after grounding**, only when intent exists, confidence ≠ `low`, and `out_of_scope_files` is non-empty and not every changed file. Grounding gate, `INJECTION_GUARD` text and position untouched; score recomputed from filtered survivors.
7. **Structured output:** reuse `OpenRouterProvider` unchanged (strict `json_schema` + `parseWithRepair`), JSON shape also spelled out in the classifier prompt (fallback when a routed provider ignores `response_format`), `maxRetries: 1`, schema without `.optional()`. *Rejected:* `provider.require_parameters: true` in `openrouter.ts` (shared by all reviews + CI; can hard-fail routing).
8. **Default model `openrouter`/`deepseek/deepseek-v4-flash`** — already the default for two cheap system features (`platform.ts:50,78`), proven on this structured path; configurable in Settings → Models. *Rejected:* `openai/gpt-4.1` (not flash; Settings UI stores only openrouter choices, `SettingsModels.tsx:32`).
9. **Confidence = enum `high|medium|low`, clamped deterministically:** body < 40 chars and no resolved linked issue/plan/spec ⇒ `low`; short body but a resolved issue or plan/spec ⇒ ≤ `medium`; any unresolved source ⇒ ≤ `medium`; empty `in_scope` ⇒ `low`; final = min(model self-report, ceiling). *Rejected:* numeric self-confidence.
10. **Sources — exactly four cheap signals, no diff bodies:**

    | Signal | Source | Always present? |
    |---|---|---|
    | PR title | `pull_requests.title` | yes |
    | PR body | `pull_requests.body` (capped 4000 chars) | optional |
    | Linked issue (title + body) | live GitHub call via `container.github()` → `getIssue`, refs found by regex `(close[sd]?\|fix(e[sd])?\|resolve[sd]?) #N` over the body (same repo only) | optional |
    | Changed files + hunk headers (`@@ -.. +.. @@`) | `UnifiedDiff` from `loadDiff` (git diff, or reconstruction from `pr_files.patch`) | yes |
    | Plan / spec file | repo file read **at the PR head SHA** via new `GitClient.readFileAt` (`git show <head>:<path>`). Candidates: (a) repo-relative paths or same-repo `/blob/<ref>/<path>` links in the body with a doc extension (`.md .mdx .txt .rst .adoc`); (b) files changed by the PR under `docs/plans/**` or `**/specs/**`. Deduped, max 3, ≤ 6000 chars each, ≤ 18000 total | optional |

    | External link (ticket / plan / spec page) | any other https URL in the body, fetched via the existing SSRF-safe `HttpUrlFetcher` (`server/src/adapters/url-fetcher/index.ts:61`: http(s) only, every resolved IP must be public incl. `169.254.169.254`, manual redirects re-validated per hop, streamed size cap, timeout) **only if the host is in `INTENT_LINK_ALLOWLIST`**. Content-type `text/markdown`/`text/plain`/`text/html` only; HTML → plain text. Max 3, ≤ 200 KB download, ≤ 6000 chars each (shares the 18000 docs budget) | optional |

    A link that cannot be used is recorded as `unresolved` — `not_allowlisted` (host not in allowlist), `unsupported_content` (e.g. PDF), `fetch_failed` (network error, HTTP error, empty text such as a JS-rendered Notion/Jira page), `timeout` — listed in `missing_context`, confidence ceiling ≤ `medium`. A referenced plan/spec that cannot be read (`not_found`, `repo_not_cloned`, `invalid_ref`) is likewise unresolved. Nothing is ever fabricated. Other issue syntaxes and non-doc paths are ignored. *Rejected:* commit messages, authenticated Jira/Linear/Notion APIs, GraphQL `closingIssuesReferences`.
11. **Reads never call a model:** `GET` returns stored intent + computed `stale`; `POST` classifies synchronously. *Rejected:* job + SSE.
12. **Review path auto-computes intent when missing/stale** once per `executeRuns`, reuses on matching head (Open question 2). Failure → review proceeds without intent, flagged in Live Log + `trace.intent`.
13. **Token estimate** via existing `TiktokenTokenizer`; no new dependency. *Rejected:* chars/4.
14. **One row per PR (upsert), no history;** `confidence` as text enum without CHECK, following repo precedent (`docs/plans/conventions-extractor.md:52`).
15. **Intent cost stored on `pr_intent.api_cost_usd` only** (real cost), not added to PR-list totals (Open question 4).
16. **UI:** full card at top of Overview (default tab) + compact card at top of Findings, above results (Run review switches to Findings, `page.tsx:132`).
17. **Logging:** section names, char counts, token estimate, provider/model, tokens, cost, confidence, per-source `{kind, ref(redacted), status, reason}`. Never PR/issue/doc bodies, diff or hunk text, keys. URLs logged without query/fragment/userinfo.

18. **Diff access from `intent`:** on the review path the executor passes its already-loaded `UnifiedDiff` (`ctx.diff`); on `POST /pulls/:id/intent` the service calls an `IntentDeps.loadDiff(workspaceId, prId)` port implemented inline in `container.ts` over the existing `loadDiff` (server INSIGHTS 2026-09-23 pattern) — `intent` never imports `reviews` internals.

### Resolved decisions (user, 2026-09-27)
1. Sources = the six signals in Decision 10 (title, body, linked issue, files + hunk headers, plan/spec files, allowlisted external links); non-allowlisted links → `unresolved/not_allowlisted`.
2. Stale/missing intent at review time → auto re-classify; failure → review without intent.
3. "Serious" out-of-scope = CRITICAL or `category=security`.
4. Intent cost stored on `pr_intent` only.

## 2. Affected modules
| Package | Touched? | Why / what changes | Architecture rule that applies |
|---|---|---|---|
| server | yes | New `modules/intent/` (ports, domain, repository, mappers, service, routes, index); container getter + override; registry; `readFileAt` impl + mock; schema + migration 0014; executor calls intent port; seed row | onion: routes ring 4 thin; service ring 2 with `IntentDeps` (no `Container`); domain/constants/types ring 1; repository/mappers ring 3; adapters constructed only in `container.ts`; `reviews` imports only `intent/ports.ts`/`index.ts`; depcruise baseline must not grow |
| client | yes | `lib/hooks/intent.ts`; route-local `_components/IntentCard/`; Overview + Findings tabs; `page.tsx` invalidation; `brief.json`; registry default | frontend-ui-architecture: `_components/IntentCard/` + `index.ts` barrel, container/presentational split, helpers/constants/styles files, data via hook → `api`, next-intl strings |
| reviewer-core | yes | `src/intent/*` (schema, prompt, clamp, file summary, render, scope filter); optional `intent` slot in `prompt.ts`; optional `intent` input + post-filter in `run.ts`; exports | Grounding gate untouched and first; `INJECTION_GUARD` untouched and last; intent wrapped with `wrapUntrusted`; classifier has its own guard |
| e2e | yes | New flow `specs/12-pr-intent.flow.json`; README coverage row | new deterministic flow, no LLM |
| shared (vendored) | yes | `review-api.ts`, `trace.ts`, `platform.ts`, `adapters.ts` | Wave 0 only; touched blocks identical in `server/` and `client/` copies; no resync of pre-existing drift |

## 3. Contracts

### 3.1 `contracts/review-api.ts` (both copies; replaces lines 59-61)
```ts
// ---- Intent layer ----
export const IntentConfidence = z.enum(['high', 'medium', 'low']);
export type IntentConfidence = z.infer<typeof IntentConfidence>;

export const IntentSourceKind = z.enum([
  'pr_title', 'pr_body',
  'file_list',      // changed paths + hunk headers (never hunk bodies)
  'github_issue',   // 'closes/fixes/resolves #N' in the body, same repo
  'repo_doc',       // plan/spec file read at the PR head SHA
  'external_link',  // any other https URL in the body — fetched only from allowlisted hosts
]);
export type IntentSourceKind = z.infer<typeof IntentSourceKind>;

export const IntentUnresolvedReason = z.enum([
  'not_found', 'forbidden', 'no_credentials', 'fetch_failed', 'timeout',
  'not_allowlisted', 'unsupported_content', 'repo_not_cloned', 'invalid_ref', 'limit_exceeded',
]);
export type IntentUnresolvedReason = z.infer<typeof IntentUnresolvedReason>;

export const IntentSource = z.object({
  kind: IntentSourceKind,
  /** '#12' | 'docs/plans/x.md' | URL without query/fragment/userinfo. */
  ref: z.string(),
  title: z.string().nullable(),
  status: z.enum(['resolved', 'unresolved']),
  reason: IntentUnresolvedReason.nullable(), // non-null iff unresolved
  chars: z.number().int().nonnegative(),     // chars sent to the classifier (0 when unresolved)
  truncated: z.boolean(),
});
export type IntentSource = z.infer<typeof IntentSource>;

/** Intent persisted for a PR. `intent` is the one/two-sentence summary. */
export const PrIntentRecord = Intent.extend({
  pr_id: z.string(),
  head_sha: z.string().nullable(),          // null only for legacy rows ⇒ stale
  confidence: IntentConfidence,
  missing_context: z.array(z.string()),
  out_of_scope_files: z.array(z.string()),
  sources: z.array(IntentSource),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  prompt_tokens_est: z.number().int().nullable(),
  tokens_in: z.number().int().nullable(),
  tokens_out: z.number().int().nullable(),
  api_cost_usd: z.number().nullable(),      // real provider cost only
  created_at: z.string(),
  updated_at: z.string(),
});
export type PrIntentRecord = z.infer<typeof PrIntentRecord>;

/** Response of GET and POST /pulls/:id/intent. */
export const PrIntentState = z.object({
  pr_id: z.string(),
  current_head_sha: z.string(),
  stale: z.boolean(),                        // intent exists && intent.head_sha !== current_head_sha
  intent: PrIntentRecord.nullable(),
});
export type PrIntentState = z.infer<typeof PrIntentState>;

/** What the review engine consumes. */
export const IntentForReview = z.object({
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
  out_of_scope_files: z.array(z.string()),
  confidence: IntentConfidence,
});
export type IntentForReview = z.infer<typeof IntentForReview>;
```

### 3.2 `contracts/trace.ts` (both copies)
```ts
// PromptAssembly, after pr_description:
  /** Rendered "## PR intent" block (untrusted-wrapped); null when absent. */
  intent: z.string().nullish(),

// new, above RunTrace:
export const RunIntentInfo = z.object({
  status: z.enum(['reused', 'classified', 'unavailable']),
  confidence: z.enum(['high', 'medium', 'low']).nullable(),
  head_sha: z.string().nullable(),
  reason: z.string().nullable(),       // error code when unavailable, no content
  filter_applied: z.boolean(),
  filtered_out: z.number().int(),      // non-serious out-of-scope findings dropped
  aggregated: z.number().int(),        // serious out-of-scope findings merged into the one signal
});
export type RunIntentInfo = z.infer<typeof RunIntentInfo>;

// RunTrace, after log:
  intent: RunIntentInfo.nullish(),
```

### 3.3 `contracts/platform.ts` (both copies) + `client/src/lib/feature-models.ts`
```ts
{ id: 'review_intent', label: 'PR Review · Intent',
  description: 'Cheap classifier: derives a PR’s intent and scope before review.',
  defaultProvider: 'openrouter', defaultModel: 'deepseek/deepseek-v4-flash' }
```

### 3.4 `adapters.ts` (both copies) — `GitClient`
```ts
  /** File content at a commit (`git show <ref>:<path>`), not the working tree. Throws if missing locally. */
  readFileAt(repo: RepoRef, ref: string, path: string): Promise<string>;
```
Impl: `SimpleGitClient` → `this.git(repo).show([`${ref}:${path}`])`; `MockGitClient` → `opts.files[path]` or throw. `GitHubClient.getIssue` and `loadDiff` are reused as-is.

### 3.4b `UrlFetcher` (`server/src/adapters/url-fetcher/index.ts`) + config
- `fetch()` result gains `contentType: string | null` (from the final response's `content-type`); backwards-compatible — `SkillsService` ignores it; update any stub in tests that implements `UrlFetcher`.
- `server/src/platform/config.ts`: `intentLinkAllowlist: string[]` from env `INTENT_LINK_ALLOWLIST` (comma-separated hostnames, lower-cased); default `github.com,raw.githubusercontent.com,gist.github.com,gist.githubusercontent.com`; empty string ⇒ no external fetching. Documented in `server/.env.example`.
- Host matching: exact host or a subdomain of an allowlisted host (`docs.acme.io` matches `acme.io`); `github.com/<o>/<r>/blob/...` is rewritten to raw by the existing `toRawUrl`.

### 3.5 DB — `pr_intent` (`server/src/db/schema/reviews.ts:48`; `pnpm db:generate --name intent_layer` → `0014_intent_layer.sql`)
```ts
export const prIntent = pgTable('pr_intent', {
  prId: uuid('pr_id').primaryKey().references(() => pullRequests.id, { onDelete: 'cascade' }),
  intent: text('intent').notNull(),
  inScope: jsonb('in_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  outOfScope: jsonb('out_of_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  headSha: text('head_sha'),
  confidence: text('confidence', { enum: ['high', 'medium', 'low'] }).notNull().default('low'),
  missingContext: jsonb('missing_context').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  outOfScopeFiles: jsonb('out_of_scope_files').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  sources: jsonb('sources').$type<IntentSourceJson[]>().notNull().default(sql`'[]'::jsonb`),
  provider: text('provider'),
  model: text('model'),
  promptTokensEst: integer('prompt_tokens_est'),
  tokensIn: integer('tokens_in'),
  tokensOut: integer('tokens_out'),
  apiCostUsd: doublePrecision('api_cost_usd'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
```
Expected SQL (additive, constant defaults ⇒ no rewrite): `ALTER TABLE "pr_intent" ADD COLUMN` for `head_sha text`, `confidence text DEFAULT 'low' NOT NULL`, `missing_context jsonb DEFAULT '[]'::jsonb NOT NULL`, `out_of_scope_files jsonb DEFAULT '[]'::jsonb NOT NULL`, `sources jsonb DEFAULT '[]'::jsonb NOT NULL`, `provider text`, `model text`, `prompt_tokens_est integer`, `tokens_in integer`, `tokens_out integer`, `api_cost_usd double precision`, `created_at timestamptz DEFAULT now() NOT NULL`, `updated_at timestamptz DEFAULT now() NOT NULL`. `IntentSourceJson` = plain interface beside the table with §3.1 field names. PK-only access ⇒ no new index. Legacy rows: `head_sha NULL` ⇒ stale.

### 3.6 HTTP API (module `intent`)
| Method | Path | Params | Body | 200 | Errors (`ApiErrorBody`, `platform.ts:274`) |
|---|---|---|---|---|---|
| GET | `/pulls/:id/intent` | `IdParams` | — | `PrIntentState` | 404 `not_found` |
| POST | `/pulls/:id/intent` | `IdParams` | none | `PrIntentState` (fresh) | 404 `not_found`; 422 `model_not_configured`; 502 `intent_classifier_failed` (`details: { provider, model }`, never prompt text); 429 (`rateLimit: { max: 10, timeWindow: '1 minute' }`) |
Concurrent detections for one PR share one in-flight promise (no 409).

### 3.7 Server ports (`server/src/modules/intent/ports.ts`, U3)
```ts
export interface IntentRow {
  prId: string; intent: string; inScope: string[]; outOfScope: string[];
  headSha: string | null; confidence: 'high' | 'medium' | 'low';
  missingContext: string[]; outOfScopeFiles: string[]; sources: IntentSourceJson[];
  provider: string | null; model: string | null; promptTokensEst: number | null;
  tokensIn: number | null; tokensOut: number | null; apiCostUsd: number | null;
  createdAt: Date; updatedAt: Date;
}
export type UpsertIntent = Omit<IntentRow, 'createdAt' | 'updatedAt'>;
export interface PullContext {
  id: string; workspaceId: string; number: number; title: string; body: string | null;
  base: string; headSha: string;
  repo: { owner: string; name: string; fullName: string; clonePath: string | null };
}
export interface IntentRepositoryPort {
  getPullContext(workspaceId: string, prId: string): Promise<PullContext | undefined>;
  get(prId: string): Promise<IntentRow | undefined>;
  upsert(row: UpsertIntent): Promise<IntentRow>; // updated_at = now(), created_at kept
}
export interface OpsLogger { info(obj: unknown, msg?: string): void; warn(obj: unknown, msg?: string): void }
export interface ProgressSink { info(msg: string): void }
export interface EnsureIntentResult {
  status: 'reused' | 'classified' | 'unavailable';
  intent: IntentForReview | null;
  record: PrIntentRecord | null;
  reason: string | null;
}
export interface IntentForReviewPort {
  ensureForReview(workspaceId: string, prId: string,
    ctx: { diff?: UnifiedDiff; logger?: OpsLogger; progress?: ProgressSink }): Promise<EnsureIntentResult>; // never throws
}
export interface IntentDeps {
  intents: IntentRepositoryPort;
  github: () => Promise<Pick<GitHubClient, 'getIssue'>>;   // container.github(); may throw ConfigError
  loadDiff: (workspaceId: string, prId: string) => Promise<UnifiedDiff>; // inline in container over reviews' loadDiff
  files: Pick<GitClient, 'readFileAt'>;                                  // plan/spec at head SHA
  urls: Pick<UrlFetcher, 'fetch'>;                                       // container.urlFetcher (SSRF-safe)
  linkAllowlist: string[];                                               // config.intentLinkAllowlist
  llm: (provider: Provider) => Promise<LLMProvider>;
  resolveModel: (workspaceId: string) => Promise<FeatureModelChoice>;
  tokenizer: { count(text: string): number };
  now?: () => number;
}
```

### 3.8 reviewer-core API
```ts
// intent/schema.ts (strict-mode friendly)
export const IntentClassification = z.object({
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
  out_of_scope_files: z.array(z.string()),
  missing_context: z.array(z.string()),
  confidence: z.enum(['high', 'medium', 'low']),
});
export interface IntentChangedFile { path: string; additions: number; deletions: number; hunk_headers: string[] }
export interface IntentLinkedIssue { ref: string; title: string; body: string }
export interface IntentDocument { kind: 'repo_doc' | 'external_link'; ref: string; role: 'plan' | 'spec' | 'ticket' | 'doc'; content: string }
export interface IntentUnresolvedRef { kind: IntentSourceKind; ref: string; reason: IntentUnresolvedReason }
export interface IntentClassifierInput {
  pr: { number: number; title: string; body: string | null };
  files: IntentChangedFile[];
  issues: IntentLinkedIssue[]; documents: IntentDocument[]; unresolved: IntentUnresolvedRef[];
}
export interface IntentPromptSection { name: 'pr_title' | 'pr_body' | 'linked_issues' | 'documents' | 'file_list' | 'unresolved'; chars: number; truncated: boolean }
export interface ClassifyIntentResult {
  intent: IntentClassification;          // after clamp + sanitize
  modelConfidence: IntentConfidence;
  sections: IntentPromptSection[];
  documentChars: { ref: string; chars: number; truncated: boolean }[];
  messages: ChatMessage[];
  tokensIn: number; tokensOut: number; apiCostUsd: number | null; attempts: number;
}
export function classifyIntent(a: { llm: LLMProvider; model: string; input: IntentClassifierInput; sessionId?: string }): Promise<ClassifyIntentResult>;
export function buildIntentMessages(input: IntentClassifierInput): { messages: ChatMessage[]; sections: IntentPromptSection[]; documentChars: ClassifyIntentResult['documentChars'] };
export function clampIntentConfidence(model: IntentConfidence, f: { bodyChars: number; resolvedIssues: number; resolvedDocuments: number; unresolved: number; inScopeCount: number }): IntentConfidence;
export function sanitizeOutOfScopeFiles(files: string[], changed: string[]): string[];
export function changedFilesFromDiff(diff: UnifiedDiff): IntentChangedFile[];

// U2 (internal to run.ts; not added to index.ts)
export interface ReviewInput { /* existing */ intent?: IntentForReview }
export interface ScopeFilterSummary { applied: boolean; skippedReason: 'no_intent' | 'low_confidence' | 'no_out_of_scope_files' | null; filteredOut: number; aggregated: number }
export interface ReviewOutcome { /* existing */ scope: ScopeFilterSummary }
export interface PromptParts { /* existing */ intent?: string }   // assembly.intent = block ?? null
```

### 3.9 UI strings (`client/messages/en/brief.json`, U4; asserted by U7)
`intentCard.title` "Intent" · `intentCard.inScope` "In scope" · `intentCard.outOfScope` "Out of scope" · `intentCard.sources` "Sources" · `intentCard.redetect` "Re-detect intent" · `intentCard.detect` "Detect intent" · `intentCard.confidence.medium` "Medium confidence".

## 4. Work units

### U0 — Contracts, git adapter method, schema + migration (orchestrator)
| Field | Value |
|---|---|
| Kind | backend (contracts + schema) |
| Wave | 0 |
| Depends on | none |
| Owns | both copies of `src/vendor/shared/contracts/review-api.ts`, `contracts/trace.ts`, `contracts/platform.ts`, `adapters.ts`; `client/src/lib/feature-models.ts`; `server/src/adapters/git/simple-git.ts`; `server/src/adapters/mocks.ts`; `server/src/adapters/url-fetcher/index.ts` (+ any test stub implementing `UrlFetcher`); `server/src/platform/config.ts`; `server/.env.example`; `server/src/db/schema/reviews.ts`; generated `server/src/db/migrations/0014_intent_layer.sql`, `meta/0014_snapshot.json`, `meta/_journal.json` |
| Must not touch | migrations 0000–0013; unrelated drifted blocks of vendored files |
| Consumes | none |
| Produces | §3.1–§3.5 |
| Checks | server `pnpm typecheck · pnpm exec vitest run --exclude '**/*.it.test.ts' · pnpm db:migrate`; client `pnpm typecheck · pnpm test`; reviewer-core `npm run typecheck · npm test` |

**Steps** 1) Edit only the named blocks, byte-identical in both copies. 2) Mirror registry default in `client/src/lib/feature-models.ts`. 3) `readFileAt` in `SimpleGitClient` + `MockGitClient`; `contentType` in `HttpUrlFetcher` result + stubs; `intentLinkAllowlist` in `config.ts` + `.env.example` (§3.4b). 4) Extend `prIntent` + `IntentSourceJson`, `pnpm db:generate --name intent_layer`, verify file name `0014_intent_layer.sql` and only §3.5 statements, `pnpm db:migrate`. 5) Commit Wave 0.

**Acceptance criteria**
- [ ] Block diff between server/client copies is empty.
- [ ] All three packages typecheck; unit suites green.
- [ ] Migration applies on fresh DB and on a DB with a legacy `pr_intent` row (`head_sha NULL`, `confidence 'low'`).

### U1 — reviewer-core: intent classifier
| Field | Value |
|---|---|
| Kind | engine |
| Wave | 1 |
| Depends on | U0 |
| Owns | `reviewer-core/src/intent/{constants,schema,file-summary,classifier-prompt,confidence,classify}.ts`, `reviewer-core/src/index.ts`, `reviewer-core/test/intent-classifier.test.ts`, `test/intent-confidence.test.ts`, `test/intent-file-summary.test.ts` |
| Must not touch | `src/prompt.ts`, `src/review/**`, `src/grounding.ts`, `src/llm/**`, U2's `src/intent/{scope-filter,render-for-review}.ts` |
| Consumes | §3.1 enums, `wrapUntrusted` (`prompt.ts:30`) |
| Produces | §3.8 classifier symbols exported from `src/index.ts` |
| Checks | `npm run typecheck · npx vitest run test/intent-classifier.test.ts test/intent-confidence.test.ts test/intent-file-summary.test.ts` |

**Steps**
1. `constants.ts`: `MAX_BODY_CHARS 4000`, `MAX_DOC_CHARS 6000`, `MAX_DOCS_TOTAL_CHARS 18000`, `MAX_FILES 200`, `MAX_HUNK_HEADERS_PER_FILE 20`, `MAX_HUNK_HEADER_CHARS 160`, `MAX_ISSUE_BODY_CHARS 4000`, `MIN_BODY_CHARS 40`, `INTENT_SCHEMA_NAME 'IntentClassification'`, `INTENT_MAX_RETRIES 1`, `INTENT_TEMPERATURE 0`, `INTENT_MAX_TOKENS 1200`.
2. `schema.ts`: §3.8 with `.describe()` per field (`out_of_scope_files` verbatim from list).
3. `file-summary.ts`: only lines starting `@@`, capped; `changedFilesFromDiff` from `diff.raw` per file + counts from `diff.files`; never returns `+`/`-`/context lines.
4. `classifier-prompt.ts`: trusted system prompt (explain WHY/WHAT from provided data only, never invent requirements for unresolved sources — list them in `missing_context`, JSON shape spelled out) + `INTENT_CLASSIFIER_GUARD`; user message = one `wrapUntrusted` per section (`pr-title`, `pr-body`, `issue:#N`, `plan:<path>` / `spec:<path>`, `files`), caps enforced, trusted "Unresolved sources" list (ref + reason only); returns sections + documentChars.
5. `confidence.ts`: `clampIntentConfidence` (Decision 9), `sanitizeOutOfScopeFiles` (`\`→`/`, exact match, dedupe, `[]` if it covers all files).
6. `classify.ts`: messages → `completeStructured({ schema, schemaName, messages, maxRetries: 1, temperature: 0, maxTokens, sessionId })` → clamp + sanitize; lists ≤ 10 items, items ≤ 300 chars.
7. Export §3.8 from `src/index.ts`.

**Acceptance criteria**
- [ ] With a stub `LLMProvider`, sent messages contain every hunk header and no diff body line (canary).
- [ ] Empty body + no docs ⇒ `low` even if model says `high`; any unresolved ⇒ ≤ `medium`; unresolved appear as ref+reason only.
- [ ] Unknown path in `out_of_scope_files` removed; full-list ⇒ `[]`.
- [ ] `</untrusted>` in body is escaped; guard present in system message.
- [ ] Sections report chars and `truncated: true` when a cap is hit; a stub returning invalid JSON once then valid succeeds with `attempts: 2`.

### U2 — reviewer-core: intent injection + deterministic scope filter
| Field | Value |
|---|---|
| Kind | engine |
| Wave | 1 |
| Depends on | U0 |
| Owns | `reviewer-core/src/prompt.ts`, `src/review/run.ts`, `src/intent/render-for-review.ts`, `src/intent/scope-filter.ts`, `test/intent-injection.test.ts`, `test/scope-filter.test.ts`, `specs/grounding-contract.md`, `docs/pipeline.md` |
| Must not touch | `src/index.ts` (U1), `src/grounding.ts`, `INJECTION_GUARD` text/position, `src/llm/**`, U1 files |
| Consumes | §3.1 `IntentForReview`, §3.2 `PromptAssembly.intent`, `Finding` (`findings.ts:47`) |
| Produces | `ReviewInput.intent`, `ReviewOutcome.scope`, `PromptParts.intent` |
| Checks | `npm run typecheck · npm test` (existing `prompt.test.ts`/`run.test.ts` stay green) |

**Steps**
1. `render-for-review.ts`: trusted header (machine-derived, confidence; prioritise in-scope; out-of-scope files: report only CRITICAL/security; never lowers severity) + `wrapUntrusted('derived-intent', summary/in/out/out-of-scope files)`, ≤ 3000 chars.
2. `prompt.ts`: `intent?: string` → `## PR intent\n<block>` right after `## PR description`; `assembly.intent = block ?? null`; system composition (`prompt.ts:90`) unchanged.
3. `scope-filter.ts`: `applyScopeFilter(findings, intent?)` per Decisions 5–6 → `{ kept, dropped[{finding, reason:'out_of_scope'}], aggregatedFrom, summary }`. Aggregate = carrier's location/category/confidence, max severity, title `Outside PR scope: <title>` + ` (+N more)`, rationale + list of all merged (`file:line — title (SEVERITY)`).
4. `run.ts`: accept `intent`; render into prompt; apply filter to `ground.kept`; one `info` event per dropped, one `result` for the aggregate; score from filtered set; return `scope` (absent intent ⇒ identical output + `scope.applied=false, skippedReason='no_intent'`).
5. Update `grounding-contract.md` (Scope filter section) and `docs/pipeline.md`.

**Acceptance criteria**
- [ ] 3 out-of-scope CRITICAL + 2 out-of-scope non-security WARNING + 1 in-scope WARNING ⇒ 2 kept (in-scope + 1 CRITICAL aggregate naming all 3), 2 dropped.
- [ ] No serious out-of-scope ⇒ no aggregate.
- [ ] Out-of-scope security WARNING never dropped.
- [ ] `low` confidence or empty `out_of_scope_files` ⇒ unchanged, matching `skippedReason`.
- [ ] Grounding still drops hallucinated findings first; score = `scoreFromFindings(filtered)`.
- [ ] System message still ends with unchanged `INJECTION_GUARD`; intent inside `<untrusted source="derived-intent">`.

### U3 — server: intent persistence + pure domain
| Field | Value |
|---|---|
| Kind | backend |
| Wave | 1 |
| Depends on | U0 |
| Owns | `server/src/modules/intent/{ports,types,constants,repository,mappers}.ts`, `server/src/modules/intent/domain/{references,paths,staleness,redact,external}.ts`, `server/test/intent-domain.test.ts`, `server/test/intent-repository.it.test.ts` |
| Must not touch | `platform/container.ts`, `modules/index.ts`, `modules/reviews/**`, `modules/conventions/**` (re-implement the path check instead of importing it), vendored shared |
| Consumes | §3.1, §3.5, §3.7 |
| Produces | §3.7 ports, `IntentRepository`, domain functions |
| Checks | `pnpm typecheck · pnpm exec vitest run test/intent-domain.test.ts · pnpm exec vitest run test/intent-repository.it.test.ts (Docker) · pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known` |

**Steps**
1. `ports.ts` exactly §3.7 (plain interfaces, no ORM/schema import).
2. `constants.ts`: `MAX_ISSUE_REFS 3`, `MAX_DOC_REFS 3`, `MAX_LINK_REFS 5`, `DOC_EXTENSIONS ['.md','.mdx','.txt','.rst','.adoc']`, `PLAN_SPEC_GLOBS ['docs/plans/**', '**/specs/**']`, `ISSUE_REF_RE /\b(close[sd]?|fix(e[sd])?|resolve[sd]?)\s*:?\s*#(\d+)\b/gi`, `SOURCE_TIMEOUT_MS 8000`, `MAX_EXTERNAL_REFS 3`, `EXTERNAL_MAX_BYTES 200_000`, `EXTERNAL_CONTENT_TYPES ['text/markdown','text/plain','text/html']`.
3. `domain/references.ts`: `extractReferences(body, repo, changedPaths)` → deduped `{issues, docs, links, overflow}` — issues only via `ISSUE_REF_RE` (same repo); docs = same-repo `/blob/<ref>/<path>` links + bare repo-relative paths with `DOC_EXTENSIONS`, plus changed paths matching `PLAN_SPEC_GLOBS` with a doc extension (body mentions first, then changed files; cap `MAX_DOC_REFS`); every other https URL → `links` (refs via `redactUrl`, fetch uses the original URL). `docRole(path)` → `plan` | `spec` | `doc`; `linkRole(url)` → `ticket` (paths like `/browse/`, `/issue/`, `/issues/`) | `doc`.
3b. `domain/external.ts`: `isAllowlistedHost(url, allowlist)` (exact or subdomain, case-insensitive, https/http only); `isAcceptedContentType(ct)`; `htmlToText(html)` (drop `<script>/<style>/<noscript>`, strip tags, decode basic entities, collapse whitespace).
4. `domain/paths.ts`: `isSafeRepoPath` (no absolute, drive letter, `..`, NUL).
5. `domain/staleness.ts`: `isStale(intentHead, currentHead)` (null ⇒ stale).
6. `domain/redact.ts`: `redactUrl` (drop query, fragment, userinfo); `sourceLogView` → `{kind, ref, status, reason, chars}`.
7. `repository.ts`: workspace-scoped `getPullContext` (pull_requests + repos), `get`, `upsert` (`onConflictDoUpdate`, `updated_at = now()`, keep `created_at`).
8. `mappers.ts`: `toPrIntentRecord`, `toIntentForReview`.

**Acceptance criteria**
- [ ] `extractReferences` handles `Fixes #12`, `closes: #7`, bare `#5` (ignored — no keyword), same-repo blob URL → doc, `docs/plans/x.md` → doc (role `plan`), changed `server/specs/y.md` → doc (role `spec`), changed `src/a.ts` → not a doc, Jira/Linear URL → link (role `ticket`); `isAllowlistedHost('https://docs.acme.io/x', ['acme.io'])` true, `('https://evilacme.io', ['acme.io'])` false; `htmlToText` drops script content; `https://x.io/a?token=abc#f` → ref without query/fragment, 10 issue refs → 3 + overflow.
- [ ] `isSafeRepoPath('../etc/passwd') === false`; `('docs/a.md') === true`.
- [ ] IT: second upsert keeps `created_at`, advances `updated_at`; other workspace ⇒ `undefined`; `sources` round-trips.
- [ ] Depcruise: no new violation.

### U4 — client: Intent card, hook, strings
| Field | Value |
|---|---|
| Kind | ui |
| Wave | 1 |
| Depends on | U0 |
| Owns | `client/src/lib/hooks/intent.ts`; `client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/{IntentCard.tsx,index.ts,constants.ts,helpers.ts,helpers.test.ts,styles.ts,IntentCard.test.tsx}`; `.../IntentCard/_components/{IntentScopeLists,IntentSources,IntentNotices}/{<Name>.tsx,index.ts}`; `.../_components/OverviewTab/{OverviewTab.tsx,styles.ts}`; `.../_components/FindingsTab/FindingsTab.tsx`; `.../[number]/page.tsx`; `client/messages/en/brief.json` |
| Must not touch | `client/src/lib/api.ts`, `client/src/lib/hooks/index.ts`, `client/src/vendor/**`, `client/src/lib/feature-models.ts`, Settings components |
| Consumes | §3.1, §3.6, §3.9 |
| Produces | §3.9 strings, `usePrIntent`, `useDetectIntent` |
| Checks | `pnpm typecheck · pnpm exec vitest run src/app/repos/[repoId]/pulls/[number]/_components/IntentCard` |

**Steps**
1. `hooks/intent.ts`: `usePrIntent(prId)` key `['pr-intent', prId]`; `useDetectIntent(prId)` POST → `setQueryData` (global MutationCache already toasts).
2. `IntentCard` (container, `'use client'`, props `prId`, `variant: 'full'|'compact'`, optional `onViewDetails`): loading Skeleton; load error inline ErrorState + retry; empty + "Detect intent"; detecting (disabled, `aria-live="polite"`); ready. Mutation error → inline `role="alert"`; `model_not_configured` adds link to `/settings/models`.
3. Ready: header "Intent" + confidence badge + stale badge; quoted summary; `IntentScopeLists` (✓ `Icon.Check`, ✗ `Icon.X`); `IntentNotices` (stale with both short SHAs; low confidence; missing context = unresolved sources with i18n reason + `missing_context`); `IntentSources` (kind + ref, unresolved with `Icon.AlertTriangle`); footer model + relative time + "Re-detect intent" (`Icon.RefreshCw`). `compact` = header, summary, badges, notices, "View details".
4. `helpers.ts` (`confidenceTone`, `shortSha`, `unresolvedSources`, `reasonKey`) + test; `constants.ts`; `styles.ts` plain literals only (TS2742).
5. `OverviewTab`: add `prId`, full card above description. `FindingsTab`: compact card first, before verdict/run results (read the file first; add `prId`/`onViewIntent` props). `page.tsx`: pass props; in `onRunDone` also invalidate `['pr-intent', prId]`.
6. `brief.json`: add `intentCard` block (§3.9 + reason/kind/stale/lowConfidence/missingContext/error/detecting/viewDetails); existing keys unchanged.

**Acceptance criteria**
- [ ] Ready: summary, both lists, badge, sources visible; "Re-detect intent" POSTs once and renders the new summary.
- [ ] Empty shows "Detect intent"; stale shows notice with both SHAs; low confidence notice; unresolved source shows localized reason.
- [ ] POST `model_not_configured` ⇒ alert with Settings link.
- [ ] No user-visible literal outside `brief.json`; typecheck clean.

### U5 — server: intent service, routes, wiring, spec
| Field | Value |
|---|---|
| Kind | backend |
| Wave | 2 |
| Depends on | U0, U1, U3 |
| Owns | `server/src/modules/intent/{service,routes,index}.ts`, `server/src/platform/container.ts`, `server/src/modules/index.ts`, `server/test/intent-service.test.ts`, `test/intent-routes.test.ts`, `test/intent.it.test.ts`, `server/specs/intent-layer.md`, `server/specs/README.md`, `server/specs/review-flow.md` |
| Must not touch | `modules/reviews/**`, U3 files (`BLOCKED:` if a port must change), `reviewer-core/**`, vendored shared |
| Consumes | §3.1, §3.6, §3.7, §3.8 |
| Produces | `IntentService` (implements `IntentForReviewPort`), `container.intentService`, `ContainerOverrides.intentRepo`, routes §3.6 |
| Checks | `pnpm typecheck · pnpm exec vitest run test/intent-service.test.ts test/intent-routes.test.ts · pnpm exec vitest run test/intent.it.test.ts (Docker) · depcruise --ignore-known` |

**Steps**
1. `service.ts` (`IntentDeps`):
   - `getState` (404 if no PR; no model call).
   - `detect`: single-flight `Map<prId, Promise>`; `PullContext` (404); files via `changedFilesFromDiff(ctx.diff ?? await deps.loadDiff(ws, prId))`; `extractReferences(body, changedPaths)`; issues via `github().getIssue` with timeout (no token ⇒ `no_credentials`, 404 ⇒ `not_found`, 401/403 ⇒ `forbidden`, else `fetch_failed`/`timeout`); plan/spec docs only if `isSafeRepoPath` and `clonePath` (else `repo_not_cloned`) via `files.readFileAt(repo, headSha, path)` (missing ⇒ `not_found`), role from `docRole(path)`; external links: `isAllowlistedHost(url, linkAllowlist)` else `not_allowlisted`; `urls.fetch(url, EXTERNAL_MAX_BYTES)` (`ValidationError` ⇒ `fetch_failed`, abort ⇒ `timeout`); content-type not markdown/plain/html ⇒ `unsupported_content`; HTML ⇒ `htmlToText`; empty text ⇒ `fetch_failed`; role via `linkRole(url)` (`ticket` for issue-tracker-looking paths, else `doc`); overflow ⇒ `limit_exceeded`; `resolveModel` → `llm` (`ConfigError` ⇒ `AppError('model_not_configured', …, 422)`); `classifyIntent` (else `AppError('intent_classifier_failed', …, 502, {provider, model})`); `prompt_tokens_est = tokenizer.count(joined messages)`; build `sources`; upsert with `headSha = pull.headSha`.
   - Observability: `logger.info({ event:'intent.classified', prId, headSha, provider, model, sections, promptTokensEst, tokensIn, tokensOut, apiCostUsd, confidence, modelConfidence, sources: sourceLogView(...), durationMs })`; `logger.warn({ event:'intent.failed', prId, provider, model, code })`; `progress?.info` one-liners. Never body/doc/hunk/messages/keys.
   - `ensureForReview`: reuse if not stale, else `detect`; catch all ⇒ `unavailable` + code.
2. `routes.ts`: GET/POST per §3.6 (`IdParams`, `getContext`, POST rate limit, `req.log` as logger).
3. `index.ts`: re-export `IntentForReviewPort`, `EnsureIntentResult`.
4. `container.ts`: `intentService` getter (`intents: overrides.intentRepo ?? new IntentRepository(db)`, `github: () => this.github()`, `files: this.git`, `urls: this.urlFetcher`, `linkAllowlist: config.intentLinkAllowlist`, `loadDiff: (ws, prId) => …` (inline: fetch pull + repo rows, call `loadDiff` from `reviews/diff-loader.ts`; verify with depcruise), `llm: p => this.llm(p)`, `resolveModel: ws => this.featureModels.resolve(ws, 'review_intent')`, `tokenizer`); `ContainerOverrides.intentRepo`. Register `intent` in `modules/index.ts`.
5. Tests: service with fake ports + `MockLLMProvider({ structuredBySchema: { IntentClassification } })`; routes via `app.inject` with `overrides: { auth: new MockAuthProvider(), intentRepo, llm: { openrouter } }`; IT via Postgres.
6. Docs: `server/specs/intent-layer.md`, row in `specs/README.md`, amend `review-flow.md` invariants (intent route = second model trigger; reads never call a model; review pre-work includes intent).

**Acceptance criteria**
- [ ] GET without intent ⇒ `{intent: null, stale: false}`, zero LLM calls.
- [ ] POST persists `head_sha = pull.head_sha`; after changing `pull_requests.head_sha`, GET ⇒ `stale: true`.
- [ ] `Closes #471` ⇒ issue resolved; `docs/plans/x.md` in body + mock files ⇒ `repo_doc` (role `plan`) resolved at head; a changed `server/specs/y.md` ⇒ `repo_doc` (role `spec`) resolved without a body mention; allowlisted URL with markdown (stub `urlFetcher`) ⇒ `external_link` resolved; allowlisted HTML ⇒ text only reaches the classifier; Linear URL (not allowlisted) ⇒ `not_allowlisted` + confidence ≤ `medium`; `application/pdf` ⇒ `unsupported_content`; empty HTML ⇒ `fetch_failed`; URL query string never appears in logs or `sources[].ref`; referenced plan missing at head ⇒ `not_found`; no clone ⇒ `repo_not_cloned`.
- [ ] Sent messages contain no diff body line (only hunk headers) — canary.
- [ ] Empty body, no refs ⇒ `low`.
- [ ] Missing key ⇒ 422 `model_not_configured`; classifier throws ⇒ 502 `intent_classifier_failed`; both `ApiErrorBody`.
- [ ] Two concurrent POSTs ⇒ one LLM call.
- [ ] Canary in PR body/issue body/doc never appears in any logger call; no URL query strings logged.
- [ ] Depcruise green; baseline file unchanged.

### U6 — server: review integration
| Field | Value |
|---|---|
| Kind | backend |
| Wave | 3 |
| Depends on | U2, U5 |
| Owns | `server/src/modules/reviews/{run-executor,service,repository}.ts`, `server/src/modules/reviews/repository/pull.repo.ts`, `server/test/reviews.it.test.ts`, `server/test/reviews-intent.it.test.ts` |
| Must not touch | `modules/intent/**`, `platform/container.ts`, `reviewer-core/**`, `db/seed.ts` |
| Consumes | `IntentForReviewPort` (via `intent/ports.ts` or `index.ts`), `container.intentService`, `ReviewInput.intent`, `ReviewOutcome.scope`, §3.2 |
| Produces | intent-aware reviews, `trace.intent`, `prompt_assembly.intent` |
| Checks | `pnpm typecheck · pnpm exec vitest run test/reviews.it.test.ts test/reviews-intent.it.test.ts (Docker) · pnpm exec vitest run --exclude '**/*.it.test.ts' · depcruise --ignore-known` |

**Steps**
1. `reviews/service.ts`: pass `container.intentService` as 4th `ReviewRunExecutor` arg (typed `IntentForReviewPort`).
2. `run-executor.ts`: after diff, `runLog.step('Deriving PR intent', () => this.intent.ensureForReview(ws, pull.id, { diff, logger, progress: runLog }), { kind: 'tool' })` once; one status line (reused/classified/unavailable + confidence + resolved/unresolved counts, no content); pass `intent` to `reviewPullRequest` when non-null; `trace.intent` from ensure result + `outcome.scope`; `traceFromBuffer` sets `intent: null`; ops log of prompt section char counts from `outcome.assembly`.
3. Delete dead `upsertIntent`/`getIntent` (`pull.repo.ts:47-68`, `repository.ts:128-136`) and the "Owns `pr_intent`" comment.
4. `reviews.it.test.ts`: `appWith` also injects `openrouter: new MockLLMProvider('openai', { structuredBySchema: { IntentClassification: INTENT_FIXTURE }, structured })`; all existing assertions unchanged.
5. `reviews-intent.it.test.ts`: (a) out-of-scope file with 2 CRITICAL + 1 WARNING, in-scope 1 WARNING ⇒ 2 persisted findings, one `Outside PR scope:`, `trace.intent = {classified, filtered_out 1, aggregated 2}`; (b) intent LLM throws ⇒ run `done`, unfiltered, `trace.intent.status='unavailable'`, Live Log line; (c) second review same head ⇒ `reused`, one intent LLM call total; (d) `prompt_assembly.intent` contains `derived-intent`.

**Acceptance criteria**
- [ ] Four IT scenarios pass; existing review IT unchanged and green.
- [ ] Classifier failure never marks a run `failed`.
- [ ] `reviews` imports only `intent/ports.ts`/`index.ts`; baseline not grown.

### U7 — e2e: seeded intent + flow
| Field | Value |
|---|---|
| Kind | e2e |
| Wave | 3 |
| Depends on | U0, U4, U5 |
| Owns | `server/src/db/seed.ts`, `e2e/specs/12-pr-intent.flow.json`, `e2e/README.md` |
| Must not touch | flows 01–11, `e2e/run.ts`, client code |
| Consumes | §3.5, §3.9 |
| Produces | seeded intent for PR #482; flow 12 |
| Checks | server `pnpm typecheck · pnpm db:seed` on fresh DB; e2e `npm run typecheck · npm run e2e:hermetic` (Linux/CI — Windows cannot spawn agent-browser, e2e INSIGHTS 2026-09-22) |

**Steps**
1. `seed.ts` after PR #482 (`seed.ts:272-354`): insert `pr_intent` with `onConflictDoNothing` — `head_sha 'a1b2c3d4e5f6'`; summary "Protect public API endpoints from abuse by unauthenticated clients with a token-bucket rate limiter."; in-scope ["Token-bucket rate-limit middleware", "Apply the limiter to public webhook endpoints", "Rate-limit settings in src/config.ts"]; out-of-scope ["Limits for authenticated/internal APIs", "User-listing behaviour"]; `out_of_scope_files ['src/api/users.ts']`; `confidence 'medium'`; sources pr_title/pr_body/file_list resolved; `model 'seed'`.
2. Flow: open `{BASE}/` → wait url `/pulls` → click PR #482 title → wait url `/pulls/482` → wait text seeded summary → "In scope" → "Out of scope" → "Medium confidence" → "Re-detect intent" (no click — no LLM in e2e).
3. README coverage row.

**Acceptance criteria**
- [ ] Hermetic run passes flow 12 and 01–11 unchanged.
- [ ] Re-seeding does not overwrite an existing intent row.

## 5. Waves
| Wave | Units | Runs | Why this order |
|---|---|---|---|
| 0 | U0 | sequential, orchestrator | contracts, `readFileAt`, schema + migration 0014 |
| 1 | U1, U2, U3, U4 | parallel | disjoint files; depend only on Wave 0 (U4 mocks API) |
| 2 | U5 | single | needs U1 `classifyIntent` + U3 ports/repo/domain |
| 3 | U6, U7 | parallel | U6 needs `container.intentService` (U5) + engine (U2); U7 needs UI (U4) + route (U5) |

Ownership check: Wave 1 — U1 `reviewer-core/src/index.ts` + `src/intent/{constants,schema,file-summary,classifier-prompt,confidence,classify}.ts`; U2 `prompt.ts`, `review/run.ts`, `src/intent/{render-for-review,scope-filter}.ts`; U3 `server/src/modules/intent/**` (non-service) + tests; U4 client only. Wave 3 — U6 `modules/reviews/**` + review tests; U7 `seed.ts` + `e2e/**`. No overlap. Serialized: `modules/index.ts` + `container.ts` → U5; `client/src/lib/api.ts` untouched; `brief.json` → U4; `vendor/shared/**` + `feature-models.ts` + migration 0014 → U0; no unit edits `INSIGHTS.md`.

## 6. Test plan
| Package | Test | Kind | Owner |
|---|---|---|---|
| reviewer-core | `intent-classifier.test.ts` (no diff bodies, guard, repair retry), `intent-confidence.test.ts`, `intent-file-summary.test.ts` | unit, hermetic | U1 |
| reviewer-core | `scope-filter.test.ts`, `intent-injection.test.ts` + existing `prompt.test.ts`/`run.test.ts` | unit | U2 |
| server | `intent-domain.test.ts` | unit | U3 |
| server | `intent-repository.it.test.ts` | DB `*.it.test.ts` | U3 |
| server | `intent-service.test.ts` (sources matrix, errors, single-flight, log canary), `intent-routes.test.ts` (`app.inject` + `MockAuthProvider`) | unit / route no-DB | U5 |
| server | `intent.it.test.ts` | DB | U5 |
| server | `reviews.it.test.ts` (openrouter mock), `reviews-intent.it.test.ts` | DB | U6 |
| client | `IntentCard.test.tsx` (ready/empty/stale/low/missing/error/re-detect), `helpers.test.ts` | component + unit, fetch mocked | U4 |
| e2e | `specs/12-pr-intent.flow.json` | deterministic flow | U7 |

## 7. Verification
```bash
cd server && pnpm db:migrate && pnpm typecheck && pnpm test \
  && pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known
cd ../reviewer-core && npm run typecheck && npm test
cd ../client && pnpm typecheck && pnpm test
cd ../e2e && npm run typecheck && npm run e2e:hermetic   # CI/Linux
```
Manual smoke (`./scripts/dev.sh`): PR #482 shows the full card on Overview and the compact card on Findings; with an OpenRouter key, "Re-detect intent" updates the card; running a review shows "Deriving PR intent…" and a reused/classified line in the Live Log; the trace has `prompt_assembly.intent`. Then `/pr-self-review` (accept DET-003, see §8); `plan-verifier` after every wave commit.

## 8. Risks
| Risk | How it shows up | Mitigation |
|---|---|---|
| Untrusted PR text steers scope to suppress findings | WARNINGs in a "declared out-of-scope" file vanish | Serious (CRITICAL/security) always survive as one aggregate listing every merged finding; filter off at `low`; `out_of_scope_files` must be real changed files and not all of them; per-finding drop logs + `trace.intent` counts; severity never lowered; documented in `grounding-contract.md` |
| Prompt injection into the classifier | Absurd intent / forced "high" | Separate guard, `wrapUntrusted` on all sources, deterministic confidence ceiling, per-source caps |
| Review tests hit a real OpenRouter key | Intent step resolves `openrouter` while `reviews.it.test.ts:121` injects only `openai`; secrets read from `~/.devdigest/secrets.json` (`config.ts:74`) | U6 injects an `openrouter` mock in every review test; U5 tests likewise |
| Vendored drift / DET-003 | `/pr-self-review` flags `src/vendor/shared` | U0 edits touched blocks identically + diffs; accept DET-003: "Intent layer contracts, edited identically in both vendored copies (no upstream package)" |
| Migration numbering / generator noise | Wrong number or extra statements | U0 verifies `0014_intent_layer.sql` contents before apply; never edit 0000–0013 |
| Depcruise baseline | New edges into intent internals or container | `reviews` → `intent/ports|index` only; services take `IntentDeps`; baseline file must not change |
| Wave 1 compile coupling | server typecheck compiles reviewer-core sources mid-edit by U1/U2 | U3 re-runs after U1/U2 settle; errors inside `reviewer-core/` are not U3's |
| Stale detection lag | `head_sha` only refreshed by list sync (`pulls/routes.ts:66-73`) | Documented; PR page is reached via the synced list |
| Body missing on review path | `body` persisted only by `GET /pulls/:id` (`pulls/routes.ts:271-281`) | Confidence clamps to `low` (filter off); user can re-detect |
| Head commit not in local clone | `readFileAt` fails | Recorded `not_found`/`repo_not_cloned`; never fabricated; confidence lowered |
| SSRF via external links | PR author puts an internal URL in the body | Allowlist checked BEFORE any request; `HttpUrlFetcher` blocks private/link-local IPs and re-validates every redirect hop; known DNS-rebinding gap (server INSIGHTS 2026-09-24) mitigated by a narrow default allowlist |
| Injection via fetched pages | Page text tries to steer the classifier | Same `wrapUntrusted` + classifier guard + per-doc caps; HTML scripts stripped; confidence clamp is deterministic |
| Secrets in URLs | `?token=` in a linked URL | `redactUrl` for `sources[].ref` and logs; the original URL is used only for the request |
| Extra latency/cost | One more call before first review per head | Reuse by head SHA; flash model; once per run for all agents |

## 9. Out of scope
- Commit messages as a source; authenticated Jira/Linear/Notion APIs (their pages usually need login ⇒ `fetch_failed`); a Settings UI for the allowlist (env only); issue refs other than `closes/fixes/resolves #N` in the same repo.
- GitHub GraphQL `closingIssuesReferences` / timeline cross-references.
- User-editable intent; intent history.
- Rendering `trace.intent` / `prompt_assembly.intent` in `RunTraceDrawer`; an intent column in the PR list.
- Using intent in the CI runner.
- Changing `OpenRouterProvider` routing (`require_parameters`).
- Locales other than `en`.