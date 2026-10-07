# PR Brief (Why + Risk Brief) — development plan

| Field | Value |
|---|---|
| Status | draft |
| Goal | On a PR's Overview tab a reviewer generates (or reopens for free) a grounded brief — summary, Risk areas, Review focus — and one click on a focus item opens Files changed at that file/line (SPEC-04). |
| Requirements source | [`specs/2026-10-07-pr-brief.md`](../../specs/2026-10-07-pr-brief.md) (SPEC-04, approved 2026-10-07) — input only, never edited here |
| Execution mode | multi-agent (parallel waves) — chosen by the user |
| Packages touched | server · client · e2e · shared (vendored) |

## 1. Context
- Overview renders only Intent, Blast radius and the description (`client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx:17-36`). Tab state is `?tab` only and uses `router.replace` (`.../pulls/[number]/page.tsx:61-69`).
- `PrBrief` is unused (`server/src/vendor/shared/contracts/brief.ts:117-124`). The `pr_brief(pr_id, json)` table exists and is never written (`server/src/db/schema/reviews.ts:83-88`). `risk_brief` defaults to `openai/gpt-4.1` (`server/src/vendor/shared/contracts/platform.ts:59-65`).
- Closest sibling module: onboarding (one `completeStructured` call, deadline, grounding, single-flight, `server/src/modules/onboarding/service.ts:85-127`, `:249-268`). Intent provides the `model_not_configured` 422 precedent (`server/src/modules/intent/service.ts:208-217`) and the 10/min rate limit (`server/src/modules/intent/routes.ts:24`).
- Constraints relied on: per-attempt `timeoutMs` (`server/INSIGHTS.md:15`); no cross-module `domain/` imports (`server/INSIGHTS.md:37`); narrow ports wired inline in the container (`:39`); seed is insert-once (`:12`); named regex groups (`:61`); runtime-built secret fixtures (`:59`); open the collapsed ancestor too (`client/INSIGHTS.md:15`); `!data` error guard (`:17`); sticky header offset (`:24`); vendored drift (`:26`); type-only shared imports (`:57`); poll assertions via `getQueryData` (`:41`); `fireEvent`, no user-event (`:42`).

### Requirements review
Approved-spec fast path (feasibility + testability only). Findings and resolutions:
1. AC-7 × NFR-3/EC-6 — adapter `timeoutMs` is per attempt and there is no AbortSignal (`server/src/adapters/llm/openai.ts:90-110`, `server/src/vendor/shared/adapters.ts:62-63`). **Resolved (user, Q1a):** see Decision 1.
2. EC-7/AC-5 after the deadline — in-progress is cleared at the deadline and the late result is discarded (**accepted default**).
3. `MockLLMProvider` always reports `attempts: 1` (`server/src/adapters/mocks.ts:90-106`) → AC-7 uses a test-local stub provider.
4. AC-46 "latest review" = newest review with `kind: 'review'` (**accepted**, matches `DiffTab.tsx:99`).
5. `no_context_docs` is recorded when no context document ends up `included` (**accepted**). This also covers EC-12.
6. Context docs need a workspace-wide attachment union and a path-list reader. Both go into project-context (U3) and are exposed to `brief` through a port (`server/src/modules/project-context/service.ts:173-224`).
7. AC-18 gets its own `brief/domain` parser, because intent's `domain/references.ts` cannot be imported.
8. Brief prompt uses the exported `wrapUntrusted` (`reviewer-core/src/prompt.ts:46-53`) and its own system prompt. reviewer-core is untouched.
9. AC-72 provider is resolved client-side from settings override or `client/src/lib/feature-models.ts:29`, combined with `useSecretsStatus` (`client/src/lib/hooks/core.ts:58`).
10. Diff targeting needs controlled open state in `RoleGroup` (`RoleGroup.tsx:30`) and `FileCard` (`client/src/components/diff-viewer/FileCard/FileCard.tsx:46-48`).
11. Seed row goes outside the `if (!pr)` guard (`server/src/db/seed.ts:402`, intent precedent `:616-670`).
12. Vendored `brief.ts` and `brief.json` are Wave 0. DET-003 needs an `accept`.
13. All 84 SPEC-04 rows (incl. Could) are covered so the final `plan-verifier scope=all` is clean.
- Recommendation "separate presentational `BriefBanner`, `VerdictBanner` untouched": **accepted**.

### Decisions
1. **Deadline (Q1a).** `maxRetries: 1`, and each call gets `timeoutMs = max(1 000, deadline − now)`. An outer 90 s race returns `failed`/`timeout`. At the deadline the PR's in-flight entry is removed only if its generation token still matches. A late result is never stored or logged as success. *Rejected:* `maxRetries: 0` (breaks AC-7); AbortSignal in all adapters (touches reviewer-core and every LLM path).
2. **Synchronous POST** returns the brief page (`generated|outdated|refused|failed|generating`). Failures are HTTP 200 + `status: failed` with a reason. Only EC-3 (422), EC-14 (404), EC-8 (429) and schema 422s are HTTP errors. *Rejected:* job queue + SSE (spec defines a synchronous page).
3. **Preselection reason is structured** (`reason_code` + `scope`), formatted by the web app via i18n (AC-73). The API never returns English prose.
4. **Context docs port** = `ProjectContextService.list` (walk, tokens) + two new methods (U3). "Project document" = a path in the walked list (AC-32).
5. **Regenerate body** (AC-67) = `context_paths` = every `provenance.context_docs[].path` in recorded order.
6. **Layout ownership.** OverviewTab composes `PrBriefSection` (banner/states/notes), `RiskAreas`, `ReviewFocus`, IntentCard (new `riskSlot`), BlastRadius, Description. Navigation uses `router.push` in `page.tsx`.
7. **Server tests** live in `server/test/` (repo convention). Client tests are colocated.

### Open questions
none

## 2. Affected modules
| Package | Touched? | Why / what changes | Architecture rule that applies |
|---|---|---|---|
| server | yes | new `modules/brief/`, project-context port methods, container getter, module registration, seed row, `prompts/brief.system.md` | onion: routes → service → ports/domain; Drizzle only in repositories; wiring only in `platform/container.ts`; depcruise baseline must not grow |
| client | yes | `lib/hooks/brief.ts`; `_components/{PrBriefSection,RiskAreas,ReviewFocus}`; OverviewTab/IntentCard/page; diff target in DiffTab/RoleGroup/diff-viewer | frontend-ui-architecture: data via hooks, thin page, colocated tests, strings via `brief` namespace |
| reviewer-core | no | only imports `wrapUntrusted` | grounding gate and `INJECTION_GUARD` byte-identical |
| e2e | yes | new `specs/17-pr-brief.flow.json` | deterministic, seeded, no LLM |
| shared (vendored) | yes | `contracts/brief.ts` PrBrief block in both copies | identical edit, Wave 0 only |

## 3. Contracts (the Interfaces every unit agrees on)

### 3.1 Vendored `contracts/brief.ts` — replace lines 117-124 identically in `server/src/vendor/shared/` and `client/src/vendor/shared/`
Also update the header comment line 4-5 to "Intent, Blast radius, Risks, PR History, Smart Diff, PR Brief." Leave every other block untouched.
```ts
import { ProjectDocStatus } from './project-context.js'; // add to imports (top of file)

// ---- PR Brief (SPEC-04) ----
export const ReviewFocusItem = z.object({
  file: z.string(),
  line: z.number().int().positive().nullable(),
  reason: z.string(),
});
export type ReviewFocusItem = z.infer<typeof ReviewFocusItem>;

export const PrBrief = z.object({
  summary: z.string(),
  risks: z.array(Risk),
  review_focus: z.array(ReviewFocusItem),
});
export type PrBrief = z.infer<typeof PrBrief>;

export const BriefDroppedInputKind = z.enum(['blast_caller', 'cron', 'endpoint', 'changed_file', 'context_doc', 'issue_body']);
export type BriefDroppedInputKind = z.infer<typeof BriefDroppedInputKind>;
export const BriefDroppedInput = z.object({ kind: BriefDroppedInputKind, id: z.string() });
export type BriefDroppedInput = z.infer<typeof BriefDroppedInput>;

export const BriefContextDoc = z.object({ path: z.string(), status: ProjectDocStatus, tokens: z.number().int().nullable() });
export type BriefContextDoc = z.infer<typeof BriefContextDoc>;

/** missing_sources values: intent_not_detected | intent_stale | blast_degraded:<reason> | blast_unavailable |
 *  no_linked_issue | linked_issue_unresolved | no_context_docs | pr_body_empty | pr_body_truncated | issue_body_truncated */
export const BriefProvenance = z.object({
  head_sha: z.string(),
  generated_at: z.string(),            // ISO-8601
  provider: z.string(),
  model: z.string(),
  attempts: z.number().int().positive(),
  tokens_in: z.number().int().nonnegative(),
  tokens_out: z.number().int().nonnegative(),
  cost_usd: z.number().nullable(),     // real provider cost only
  context_docs: z.array(BriefContextDoc),
  dropped_inputs: z.array(BriefDroppedInput),
  missing_sources: z.array(z.string()),
});
export type BriefProvenance = z.infer<typeof BriefProvenance>;

/** pr_brief.json */
export const PrBriefRecord = z.object({ brief: PrBrief, provenance: BriefProvenance });
export type PrBriefRecord = z.infer<typeof PrBriefRecord>;

export const BriefStatus = z.enum(['none', 'generating', 'generated', 'outdated', 'refused', 'failed']);
export type BriefStatus = z.infer<typeof BriefStatus>;

/** refused: no_changed_files | over_budget · failed: timeout | llm_error | invalid_output | store_failed · else null */
export const BriefPage = z.object({
  status: BriefStatus,
  reason: z.string().nullable(),
  brief: PrBrief.nullable(),
  provenance: BriefProvenance.nullable(),
  current_head_sha: z.string(),
});
export type BriefPage = z.infer<typeof BriefPage>;

export const GenerateBriefBody = z.object({
  regenerate: z.boolean().optional(),
  context_paths: z.array(z.string().min(1).max(512)).max(50).optional(),
});
export type GenerateBriefBody = z.infer<typeof GenerateBriefBody>;

export const BriefCandidateReason = z.enum(['pr_referenced', 'general', 'scope_touched', 'scope_not_touched']);
export type BriefCandidateReason = z.infer<typeof BriefCandidateReason>;
export const BriefContextCandidate = z.object({
  path: z.string(),
  estimated_tokens: z.number().int().nonnegative(),
  preselected: z.boolean(),
  reason_code: BriefCandidateReason,
  scope: z.string().nullable(), // top-level dir for scoped docs, else null
});
export type BriefContextCandidate = z.infer<typeof BriefContextCandidate>;
export const BriefContextCandidates = z.object({ cloned: z.boolean(), candidates: z.array(BriefContextCandidate) });
export type BriefContextCandidates = z.infer<typeof BriefContextCandidates>;
```

### 3.2 HTTP (module `brief`, all `IdParams`, workspace via `getContext`)
| Method · path | Body | 200 | Errors |
|---|---|---|---|
| `GET /pulls/:id/brief` | — | `BriefPage` (never `refused`/`failed`; 0 LLM, 0 GitHub calls) | 404 not in workspace |
| `POST /pulls/:id/brief` (`rateLimit: { max: 10, timeWindow: '1 minute' }`) | `GenerateBriefBody` | `BriefPage` | 404 · 422 `model_not_configured` · 422 schema · 429 |
| `GET /pulls/:id/brief/context-candidates` | — | `BriefContextCandidates` | 404 |

### 3.3 Server module contracts (Wave 0, `server/src/modules/brief/`)
`constants.ts`:
```ts
export const RISK_KINDS = ['auth_surface','dependency','performance','data_migration','api_contract','config_secrets','test_coverage','other'] as const;
export const PROMPT_TOKEN_BUDGET = 8_000;  export const MAX_OUTPUT_TOKENS = 1_500;
export const GENERATION_DEADLINE_MS = 90_000; export const STRUCTURED_MAX_RETRIES = 1; export const MIN_ATTEMPT_TIMEOUT_MS = 1_000;
export const MAX_RISKS = 6; export const MAX_FOCUS_ITEMS = 5;
export const PR_BODY_MAX_CHARS = 4_000; export const ISSUE_BODY_MAX_CHARS = 4_000;
export const BUDGET_TOP_CALLERS = 20; export const BUDGET_TOP_ENDPOINTS = 20; export const BUDGET_TOP_CHANGED_FILES = 40;
export const GENERAL_DOC_DIRS = ['specs', 'docs', 'insights'] as const;
export const BRIEF_DRAFT_SCHEMA_NAME = 'pr_brief_draft';
```
`types.ts`:
```ts
import { z } from 'zod';
import type { SmartDiffRole, BriefDroppedInputKind, PrBrief } from '@devdigest/shared';
export const BriefDraft = z.object({            // model output, looser than PrBrief; grounding produces PrBrief
  summary: z.string(),
  risks: z.array(z.object({ kind: z.string(), title: z.string(), explanation: z.string(),
    severity: z.enum(['high', 'medium', 'low']), file_refs: z.array(z.string()) })),
  review_focus: z.array(z.object({ file: z.string(), line: z.number().int().nullable(), reason: z.string() })),
});
export type BriefDraft = z.infer<typeof BriefDraft>;
export type HunkRange = readonly [start: number, end: number];
export interface BriefFileFact { path: string; additions: number; deletions: number; role: SmartDiffRole | null; hunks: HunkRange[] }
export interface BriefCallerFact { symbol: string; name: string; file: string; line: number }
export interface BriefInput {
  pr: { title: string; body: string };                       // body already capped
  totals: { files: number; additions: number; deletions: number };
  files: BriefFileFact[];
  intent: { intent: string; in_scope: string[]; out_of_scope: string[] } | null;
  blast: { summary: string; callers: BriefCallerFact[]; endpoints: string[]; crons: string[] } | null;
  issue: { number: number; title: string; body: string } | null; // body already capped
  docs: { path: string; text: string }[];                    // priority order, highest first
}
export interface BudgetResult { input: BriefInput; dropped: { kind: BriefDroppedInputKind; id: string }[]; tokens: number; fits: boolean }
export interface GroundingContext { changedPaths: ReadonlySet<string>; groundingSet: ReadonlySet<string>; hunksByPath: ReadonlyMap<string, readonly HunkRange[]> }
export interface GroundingResult { brief: PrBrief; drops: { refs: number; risks: number; focus: number } }
```
`ports.ts` (plain interfaces, no ORM/adapter imports):
```ts
import type { BlastRadiusResponse, SmartDiffResponse, FeatureModelChoice, LLMProvider, ProjectDocStatus, PrBriefRecord } from '@devdigest/shared';
export interface BriefPull { id: string; workspaceId: string; repoId: string; number: number; title: string; body: string | null; headSha: string; repo: { owner: string; name: string; clonePath: string | null } }
export interface BriefPrFile { path: string; additions: number; deletions: number; patch: string | null }
export interface BriefIntentRow { intent: string; inScope: string[]; outOfScope: string[]; headSha: string }
export interface BriefRepositoryPort {
  getPull(workspaceId: string, prId: string): Promise<BriefPull | null>;
  listPrFiles(prId: string): Promise<BriefPrFile[]>;
  getIntent(prId: string): Promise<BriefIntentRow | null>;
  getStored(prId: string): Promise<unknown | null>;            // raw json; service validates
  upsert(prId: string, record: PrBriefRecord): Promise<void>;  // replace on conflict
}
export interface BriefDocRead { path: string; status: ProjectDocStatus; text: string | null; tokens: number | null }
export interface BriefContextDocsPort {
  attachedPaths(workspaceId: string): Promise<string[]>;
  listProjectDocs(workspaceId: string, repoId: string): Promise<{ cloned: boolean; documents: { path: string; estimated_tokens: number }[] }>;
  readDocs(clonePath: string | null, paths: string[]): Promise<BriefDocRead[]>;
}
export interface BriefIssuePort { getIssue(repo: { owner: string; name: string }, n: number): Promise<{ title: string; body: string | null }> }
export interface OpsLogger { info(obj: object, msg?: string): void; warn(obj: object, msg?: string): void }
export interface BriefDeps {
  briefs: BriefRepositoryPort;
  blast: (workspaceId: string, prId: string) => Promise<BlastRadiusResponse>;
  smartDiff: (workspaceId: string, prId: string) => Promise<SmartDiffResponse>;
  github: () => Promise<BriefIssuePort>;
  contextDocs: BriefContextDocsPort;
  llm: (provider: FeatureModelChoice['provider']) => Promise<LLMProvider>;
  resolveModel: (workspaceId: string) => Promise<FeatureModelChoice>;
  tokenizer: { count(text: string): number };
  loadSystemPrompt: () => Promise<string>;
  deadlineMs: number;
  now?: () => number;
}
```

### 3.4 Domain function signatures (produced in Wave 1, consumed by U7)
| File (owner) | Export |
|---|---|
| `domain/hunks.ts` (U1) | `parseHunkRanges(patch: string \| null): HunkRange[]` · `lineInRanges(line: number, ranges: readonly HunkRange[]): boolean` |
| `domain/grounding.ts` (U1) | `groundBrief(draft: BriefDraft, ctx: GroundingContext): GroundingResult` |
| `domain/issue-ref.ts` (U1) | `findLinkedIssue(title: string, body: string \| null): number \| null` |
| `domain/page.ts` (U1) | `parseStoredRecord(json: unknown): PrBriefRecord \| null` · `buildPage(a: { record: PrBriefRecord \| null; headSha: string; generating: boolean }): BriefPage` · `outcomePage(status: 'refused' \| 'failed', reason: string, record: PrBriefRecord \| null, headSha: string): BriefPage` |
| `domain/log.ts` (U1) | `buildBriefLogRecord(f: { prId: string; status: BriefStatus; reason: string \| null; attempts: number \| null; tokensIn: number; tokensOut: number; costUsd: number \| null; inputTokens: number \| null; dropped: Record<string, number>; grounding: { refs: number; risks: number; focus: number }; durationMs: number }): Record<string, unknown>` (event `brief.generate`) |
| `domain/context-docs.ts` (U2) | `rankContextCandidates(a: { attached: string[]; projectDocs: { path: string; estimated_tokens: number }[]; changedPaths: string[]; prTitle: string; prBody: string \| null }): BriefContextCandidate[]` (AC-33 order) |
| `domain/facts.ts` (U2) | `buildBriefInput(raw: BriefRawFacts): { input: BriefInput; missing: string[] }` — `BriefRawFacts` declared in `facts.ts`: pull title/body, files `{path, additions, deletions, hunks}`, roles map, intent row + current head SHA, blast `BlastRadiusResponse \| 'unavailable'`, issue `{ state: 'none' } \| { state: 'unresolved' } \| { state: 'ok'; number; title; body }`, docs `BriefDocRead[]` |
| `domain/budget.ts` (U2) | `fitToBudget(input: BriefInput, count: (i: BriefInput) => number, budget: number): BudgetResult` |
| `domain/prompt.ts` (U2) | `buildBriefMessages(system: string, input: BriefInput): ChatMessage[]` |
| project-context service (U3) | `workspaceAttachedPaths(workspaceId: string): Promise<string[]>` · `readDocsForBrief(clonePath: string \| null, paths: string[]): Promise<BriefDocRead-shaped[]>` |

### 3.5 Client shared pieces (Wave 0)
- `client/src/lib/pr-diff-target.ts`: `export interface DiffTarget { file: string; line: number | null }` (types only).
- `client/messages/en/brief.json`: keep every existing key and set `block.risks` → `"Risk areas"`. Add:
  - `card.title` "PR Brief"
  - `empty.title` "No brief yet"
  - `empty.body` "Generate a Why+Risk brief for this PR."
  - `actions.generate` "Generate brief"
  - `actions.regenerate` "Re-run the brief for this PR"
  - `actions.retry` "Retry"
  - `actions.settingsLink` "Open Settings → Models"
  - `actions.context` "Context"
  - `noKey` "No API key for {provider}."
  - `banner.hint` "Verdict, findings and score come from the latest agent review; what / why / risks / review-focus come from the brief."
  - `banner.findings` "{count} findings"
  - `banner.blockers` "{count} blockers"
  - `banner.score` "Score {score}"
  - `banner.tokens` "{in} → {out} tok"
  - `banner.generated` "Generated {time} · {model}"
  - `outdated` "Outdated ({oldSha} → {newSha})"
  - `refused.no_changed_files`
  - `refused.over_budget`
  - `failed.title` "Couldn't generate the brief."
  - `failed.reason.{timeout,llm_error,invalid_output,store_failed}`
  - `error.load` "Couldn't load the brief."
  - `risks.empty` = existing `noRisks`
  - `risks.expand` "Show details"
  - `focus.title` "Review focus — read these first"
  - `focus.empty` "No review focus items."
  - `missing.title` "Missing data"
  - `missing.{intent_not_detected,intent_stale,blast_unavailable,no_linked_issue,linked_issue_unresolved,no_context_docs,pr_body_empty,pr_body_truncated,issue_body_truncated}`
  - `missing.blast_degraded` "Blast radius degraded ({reason})"
  - `dropped.{blast_caller,cron,endpoint,changed_file,context_doc,issue_body}` "… {id}"
  - `context.used` "Context documents used"
  - `context.droppedByBudget` "Dropped by budget"
  - `context.search` "Search project documents"
  - `context.reason.{pr_referenced,general,scope_touched}`
  - `context.reason.scope_not_touched` "{scope} — not touched by this PR"
  - `context.loadError`
  - `nav.fileNotInDiff` "File not in this PR's diff"
  - `nav.lineNotInDiff` "Line {line} is not in the diff"

  Implementers may add no keys. A missing key is a `BLOCKED:` report.

## 4. Work units

### U1 — Brief grounding, page and log domain (server)
| Field | Value |
|---|---|
| Kind | backend (→ `implementer-backend`) |
| Wave | 1 |
| Depends on | Wave 0 |
| Owns (create/modify) | `server/src/modules/brief/domain/{hunks,grounding,issue-ref,page,log}.ts`; `server/test/brief-{hunks,grounding,issue-ref,page,log}.test.ts` |
| Must not touch | `brief/{types,constants,ports}.ts`, any other module |
| Consumes | §3.1, §3.3 |
| Produces | §3.4 U1 rows |
| Checks | `node scripts/agent-check.mjs server <owned files>` · depcruise `--ignore-known` |

**Steps**
1. `hunks.ts`: parse only `@@ -a,b +c,d @@` header lines into `[c, c+d−1]` (`d` omitted ⇒ 1, `d = 0` ⇒ no range). Never return body text.
2. `grounding.ts`, applied in this order:
   - Drop a path that is absolute, contains a `..` segment, or is not in the set by exact string equality.
   - Risk refs: `path`, `path:n`, `path:a-b`. A line or range outside every hunk range of a changed file becomes the bare path. A ref to a blast-only file keeps its path.
   - Drop risks left with 0 refs. Normalise unknown `kind` to `other`.
   - Focus: drop items whose file is not a changed file. A line `≤0` or outside the hunks becomes `null`.
   - Cap 6 risks / 5 focus items after grounding, keeping order. Count drops.
3. `issue-ref.ts`: first `closes|fixes|resolves #N` (case-insensitive, named group) over title then body; else first `#N`.
4. `page.ts`: `PrBriefRecord.safeParse` → null on failure. `buildPage` gives `generating` when `generating` is set (stored brief or null), else `none`, `generated` (SHA equal) or `outdated`.
5. `log.ts`: whitelist of numeric and enum fields only. No titles, bodies, paths, model prose.

**Acceptance criteria**
- [ ] `parseHunkRanges` table test (`+c,d`, `+c`, `+c,0`, multi-hunk); body lines never appear in the output — SPEC-04 AC-11 (part), AC-24
- [ ] invented ref `src/invented.ts` dropped; a risk with no ref left is dropped; blast-only focus file dropped — AC-21, AC-22, AC-23, UT-12
- [ ] focus line 999 → `null`; deleted file (no ranges) → `null` — AC-24, EC-20
- [ ] `a.ts:999` → `a.ts`; `a.ts:3-5` inside a hunk kept — AC-25
- [ ] `kind: "weird"` → `other` — AC-26
- [ ] 9 risks / 8 items → first 6 / 5 after grounding — AC-27
- [ ] `./a.ts`, `A.ts`, `a.ts/`, `/abs/a.ts`, `../a.ts` dropped when only `a.ts` exists — AC-29, UT-11
- [ ] renamed file: old path dropped, new path kept — EC-21
- [ ] everything dropped → empty `risks` / `review_focus` brief — EC-9
- [ ] drop counts returned for the log — AC-28 (part)
- [ ] issue-ref table: `Fixes #12 … #3` → 12; `see #7` → 7; none → null — AC-18
- [ ] `parseStoredRecord({})` → null → page `none`; SHA equal → `generated`; differs → `outdated`; generating → `generating` — AC-2, AC-3, AC-4, AC-5, EC-13 (unit part)
- [ ] log record contains only whitelisted keys; hostile strings absent — NFR-5, UT-15

### U2 — Brief input, budget, context ranking and prompt domain (server)
| Field | Value |
|---|---|
| Kind | backend (→ `implementer-backend`) |
| Wave | 1 |
| Depends on | Wave 0 |
| Owns (create/modify) | `server/src/modules/brief/domain/{facts,budget,context-docs,prompt}.ts`; `server/src/prompts/brief.system.md`; `server/test/brief-{facts,budget,context-docs,prompt}.test.ts` |
| Must not touch | U1 files, `brief/{types,constants,ports}.ts`, `reviewer-core/**` |
| Consumes | §3.1, §3.3; `wrapUntrusted`, `bucketOf`/`groupByBucket` from `@devdigest/reviewer-core` |
| Produces | §3.4 U2 rows |
| Checks | `node scripts/agent-check.mjs server <owned files>` · depcruise |

**Steps**
1. `facts.ts`:
   - Build `BriefInput` with every available item. Cap PR and issue bodies at 4 000 chars + "…".
   - Missing sources: `intent_not_detected`, `intent_stale` (intent still included), `blast_degraded:<reason>` (blast facts still included), `blast_unavailable`, `no_linked_issue`, `linked_issue_unresolved`, `no_context_docs` (no doc `included`), `pr_body_empty`, `pr_body_truncated`, `issue_body_truncated`.
   - Callers are rendered as `file:line`.
2. `budget.ts`: count via the injected counter. While over budget, drop whole items in AC-38 order and record each `{kind, id}`:
   - callers beyond top 20
   - crons
   - endpoints beyond top 20
   - changed files beyond the 40 by churn
   - docs from the lowest priority up
   - issue body

   Never drop title, body, intent, totals or blast summary. `fits=false` when still over.
3. `context-docs.ts`:
   - Candidates = dedup(attached ∪ PR-referenced `specs/…md` that is in `projectDocs`). Tokens come from `projectDocs`, else 0.
   - Reasons: general (`specs|docs|insights` or root) → preselected; scoped preselected only if a changed path shares its first segment; PR-referenced first.
   - Rest ordered with `groupByBucket`. Deterministic for shuffled input.
4. `prompt.ts` + `brief.system.md`:
   - The system prompt states the task, the output schema, a rule to cite only listed paths and lines, and its own injection guard.
   - Every untrusted item (title, body, intent, paths, symbols, blast facts, issue, each doc labelled with its path) goes through `wrapUntrusted`.

**Acceptance criteria**
- [ ] fixture with all sources → each item present in the messages — AC-10
- [ ] no intent → `intent_not_detected`; stale → `intent_stale` and the intent is still present — AC-15, AC-16
- [ ] degraded `no_data` → `blast_degraded:no_data` and the facts are present — AC-17
- [ ] no issue ref → `no_linked_issue` — AC-20
- [ ] 10 000-char body → 4 000 chars + "…" + `pr_body_truncated`; the issue body likewise → `issue_body_truncated` — UT-2, UT-4
- [ ] oversized fixture → exact drop sequence, no item cut mid-text, protected items present, tokens ≤ 8 000 with the tiktoken counter — AC-38, AC-39, AC-41, NFR-1
- [ ] 40 000-token intent fixture → `fits=false` — AC-40 (domain part)
- [ ] general docs preselected; `client/specs/x.md` with only `server/` changes → `scope_not_touched`, scope `client` — AC-30, AC-31
- [ ] PR-referenced spec first, rest in bucket order; shuffled agent order → equal output — AC-32, AC-33, NFR-7
- [ ] "ignore previous instructions" body, intent, doc and issue are wrapped; `</untrusted>` in a path is neutralised; the guard is in the system message — UT-1, UT-3, UT-5, UT-8, UT-9

### U3 — Project-context brief methods + seeded brief (server)
| Field | Value |
|---|---|
| Kind | backend (→ `implementer-backend`) |
| Wave | 1 |
| Depends on | Wave 0 |
| Owns (create/modify) | `server/src/modules/project-context/{ports,repository,service}.ts`; `server/test/project-context-service.test.ts` (update fake + new tests); `server/test/project-context-brief.it.test.ts`; `server/src/db/seed-brief.ts` (new); `server/src/db/seed.ts`; `server/test/seed-brief.test.ts` |
| Must not touch | `project-context/{routes,domain/*}` behaviour, `modules/brief/**`, `container.ts` |
| Consumes | §3.1 (`PrBriefRecord`, `ProjectDocStatus`) |
| Produces | `ProjectContextService.workspaceAttachedPaths`, `.readDocsForBrief` (§3.4); `SEED_PR_482_BRIEF` |
| Checks | `node scripts/agent-check.mjs server <owned files>` · depcruise |

**Steps**
1. `ProjectContextRepository.listEnabledAgentIds(workspaceId)` (agents `enabled = true`, stable order).
2. `workspaceAttachedPaths`: union of `buildEffectiveList` over enabled agents, deduped, first occurrence wins.
3. `readDocsForBrief`:
   - An absolute path or a `..` segment → `skipped_unsafe_path` without reading.
   - No clone → `skipped_not_cloned`.
   - Otherwise the same status logic as `resolveEffective` (`service.ts:188-214`), including `containsSecretValue` → `skipped_secret`, with `tokens` via the counter.
4. `seed-brief.ts`: a `PrBriefRecord` with `head_sha 'a1b2c3d4e5f6'`, the design-frame summary, and these items (all lines inside the seeded hunks, `seed.ts:436-561`):
   - Risks:
     - `auth_surface` high `src/middleware/ratelimit.ts:5-9`
     - `dependency` medium `pnpm-lock.yaml:124-126`
     - `performance` low `src/api/users.ts:42-44`
   - Focus:
     - `src/config.ts:12` (live key)
     - `src/api/public/webhooks.ts:7` (429 branch)
     - `src/middleware/ratelimit.ts:7`
     - `src/api/users.ts:43` (N+1)
   - Provenance: model `seed`, `cost_usd: null`, one missing source `no_context_docs`.
5. `seed.ts`: insert it for PR #482 outside the `if (!pr)` guard with `onConflictDoNothing` (pattern `seed.ts:616-670`).

**Acceptance criteria**
- [ ] one fixture per status (`included`, `skipped_not_cloned`, `skipped_missing`, `skipped_unsafe_path`, `skipped_unreadable`, `skipped_secret`) — AC-36, EC-12 (status part)
- [ ] `../../etc/passwd.md` → `skipped_unsafe_path` and `fs.read` not called — UT-7
- [ ] runtime-built fake token doc → `skipped_secret` — UT-6
- [ ] union over 2 enabled agents + 1 disabled → disabled agent's docs absent, deduped (IT) — AC-30 (source part)
- [ ] `SEED_PR_482_BRIEF` parses with `PrBriefRecord`; every focus line lies inside the seeded hunk ranges — Data and state (Seed), AC-71 (data)
- [ ] existing project-context tests stay green

### U4 — Brief data hook + PrBriefSection (client)
| Field | Value |
|---|---|
| Kind | ui (→ `implementer-ui`) |
| Wave | 1 |
| Depends on | Wave 0 |
| Owns (create/modify) | `client/src/lib/hooks/brief.ts` + `brief.test.ts`; `client/src/app/repos/[repoId]/pulls/[number]/_components/PrBriefSection/**` (`PrBriefSection.tsx`, `helpers.ts`, `constants.ts`, `styles.ts`, `index.ts`, `_components/{BriefBanner,BriefEmpty,BriefSkeleton,BriefNotice,MissingDataNote,ContextDocsUsed,ContextPicker}/`, colocated tests) |
| Must not touch | `VerdictBanner/**`, `IntentCard/**`, `OverviewTab/**`, `lib/api.ts`, messages |
| Consumes | §3.1, §3.5; `useSettings`, `useSecretsStatus`, `useDetectIntent`, `useProjectDocs`, `usePrReviews`, `formatCost`, `relativeTime`, `FEATURE_MODELS` |
| Produces | `usePrBrief(prId)`, `useGenerateBrief(prId)`, `useBriefContextCandidates(prId, enabled)`, `briefKey(prId)`; `<PrBriefSection prId repoId />` |
| Checks | `node scripts/agent-check.mjs client <owned files>` |

**Steps**
1. Hooks:
   - `usePrBrief`: GET, `refetchInterval` 2 000 ms while `status === 'generating'`.
   - `useGenerateBrief`: POST. On `generated|outdated|generating` → `setQueryData`. On `refused|failed` or an error, keep the cache and expose the result.
   - Candidates GET is enabled only when the picker opens.
2. `PrBriefSection` (container), branching on `!data` first (`client/INSIGHTS.md:17`):
   - error with Retry only without data;
   - empty card;
   - skeleton while the first generation is pending (mutation pending or `generating` with null brief);
   - banner when stored;
   - `BriefNotice` for refused, failed or HTTP error (above the brief, Retry);
   - outdated banner with Regenerate;
   - `MissingDataNote` (missing sources + dropped inputs; "Detect intent" when `intent_not_detected`);
   - `ContextDocsUsed`.
3. `BriefBanner` (presentational): summary as plain text.
   - Latest `kind:'review'` verdict, findings/blockers counts and score, or nothing.
   - Info icon with `banner.hint`.
   - Tokens in → out and `formatCost` or "—".
   - "Generated … · model".
   - Regenerate icon button (`aria-label` = `actions.regenerate`) in a loading state while pending, with the old brief kept visible.
4. Generate disabled when the resolved `risk_brief` provider (settings override, else `FEATURE_MODELS`) has no key; show the Settings → Models link.
5. `ContextPicker` popover next to Generate:
   - checkboxes, tokens, and the reason for unselected rows;
   - search over `useProjectDocs` to add any doc;
   - the selection is sent as `context_paths`.
6. Regenerate body = `{ regenerate: true, context_paths: provenance.context_docs.map(d => d.path) }`.

**Acceptance criteria**
- [ ] `none` page → "No brief yet", body text and "Generate brief"; click → one POST — AC-42, AC-43
- [ ] pending first generation → skeleton — AC-44
- [ ] stored brief → summary in banner — AC-45
- [ ] 2 reviews → newest `kind:'review'` verdict/counts/score; none → no verdict block — AC-46, AC-47
- [ ] info icon focus → hint text — AC-48
- [ ] null cost → "—"; 0.014 → "$0.014"; tokens shown — AC-49
- [ ] "Generated … · gpt-4.1" — AC-50
- [ ] provenance with `intent_not_detected`, `blast_degraded:no_data`, a dropped doc → all named; Detect intent click → intent POST — AC-62, AC-63
- [ ] used docs and docs dropped by budget listed — AC-64
- [ ] picker lists candidates with checkbox, tokens and the unselected reason ("client — not touched by this PR"); search adds a project doc — AC-65, AC-66
- [ ] regenerate click → POST body `{regenerate:true, context_paths:[…recorded]}`; while pending the old summary stays and the control is busy — AC-67, AC-68
- [ ] `generating` → refetch every 2 s (fake timers, `getQueryData`) — AC-69
- [ ] `outdated` → "Outdated (a1b2c3d → f00ba12)" + Regenerate — AC-70
- [ ] render with a stored brief → 0 POSTs — AC-71 (unit)
- [ ] `SecretsStatus.openai=false` → button disabled and Settings link present — AC-72, AC-84
- [ ] refused `over_budget` → reason message — EC-2
- [ ] POST `failed` or 500 → inline error with Retry above the brief — EC-5
- [ ] failed refetch with data → brief still shown; first GET fails → error + Retry — EC-17, EC-18
- [ ] `<img onerror>` in summary renders as text — UT-10; labels from `brief` namespace — AC-73

### U5 — RiskAreas + ReviewFocus (client)
| Field | Value |
|---|---|
| Kind | ui (→ `implementer-ui`) |
| Wave | 1 |
| Depends on | Wave 0 |
| Owns (create/modify) | `.../pulls/[number]/_components/RiskAreas/**`, `.../_components/ReviewFocus/**` (component, `helpers.ts`, `constants.ts`, `styles.ts`, `index.ts`, tests) |
| Must not touch | U4 / U6 / U8 files, messages |
| Consumes | §3.1 `Risk`, `ReviewFocusItem`; §3.5 `DiffTarget`; `notify` |
| Produces | `<RiskAreas risks changedPaths onNavigate(target: DiffTarget) variant="embedded"\|"card" />`, `<ReviewFocus items onNavigate />` |
| Checks | `node scripts/agent-check.mjs client <owned files>` |

**Steps**
1. `helpers.ts`: `sortRisks` (high → medium → low, stable); `parseFileRef("p:a-b")` → `{file, line: a}`; kind → icon map over a literal `RISK_KINDS` list with an exhaustiveness check (type-only shared import).
2. `RiskAreas`:
   - heading "Risk areas";
   - per risk: kind icon, severity colour, title, first ref as a button;
   - chevron button with `aria-expanded` reveals the explanation and all refs;
   - empty → `risks.empty`.

   A ref click on a changed file calls `onNavigate`; otherwise `notify` `nav.fileNotInDiff`.
3. `ReviewFocus`: full-width block, title + count badge, ordered buttons `file:line — reason` / `file — reason` calling `onNavigate`, empty text.

**Acceptance criteria**
- [ ] each risk shows title and first ref — AC-54
- [ ] mixed severities ordered high/medium/low, stable within — AC-55
- [ ] every vocabulary kind maps to an icon; severity colour applied — AC-56
- [ ] chevron → `aria-expanded=true`, explanation and all refs visible — AC-57
- [ ] block title "Review focus — read these first" with badge = item count — AC-58
- [ ] items in stored order as `file:line — reason` / `file — reason` — AC-59
- [ ] no risks → "No notable risks flagged."; no items → empty text — AC-60, AC-61
- [ ] changed-file ref click → `onNavigate({file,line})`; blast-only ref → toast, `onNavigate` not called — AC-79, AC-80
- [ ] Enter on a focus item calls `onNavigate`; the expand control toggles `aria-expanded` — NFR-8
- [ ] HTML in reason or explanation renders as text — UT-10; strings from `brief` — AC-73

### U6 — Files changed deep-link target (client)
| Field | Value |
|---|---|
| Kind | ui (→ `implementer-ui`) |
| Wave | 1 |
| Depends on | Wave 0 |
| Owns (create/modify) | `.../_components/DiffTab/{DiffTab.tsx,helpers.ts,helpers.test.ts,DiffTab.test.tsx,constants.ts}`; `.../DiffTab/_components/RoleGroup/RoleGroup.tsx`; `client/src/components/diff-viewer/{DiffViewer/DiffViewer.tsx,FileCard/FileCard.tsx,FileCard/FileCard.test.tsx,CodeLine/CodeLine.tsx,styles.ts,constants.ts}` |
| Must not touch | `page.tsx`, OverviewTab, messages |
| Consumes | §3.5 `DiffTarget`, `nav.*` keys |
| Produces | `DiffTab` props `targetFile?: string \| null; targetLine?: string \| null` (raw URL values); `parseDiffTarget(file, line, changedPaths): { target: DiffTarget \| null; fileNotInDiff: boolean }` |
| Checks | `node scripts/agent-check.mjs client <owned files>` |

**Steps**
1. `parseDiffTarget`: `file` must exactly equal a changed path; `line` must be a positive integer, otherwise ignored.
2. Pass `target` through `RoleGroup` (opens when it contains the target file; still toggleable) → `DiffViewer` → `FileCard` (opens and `scrollIntoView` its header with `scroll-margin-top: var(--pr-detail-header-h)`) → `CodeLine` (line ref + highlight).
3. Line rendered → scroll to it and highlight for `TARGET_HIGHLIGHT_MS = 1700`. Not rendered → `nav.lineNotInDiff` at the file header.
4. Not a changed file → `nav.fileNotInDiff` notice, nothing expanded. Without params the behaviour is unchanged.

**Acceptance criteria**
- [ ] target in collapsed `boilerplate` group with > 200 lines → group and card expanded — AC-76
- [ ] header `scrollIntoView` called — AC-82 (unit; manual sticky-header check in §7)
- [ ] rendered line → `scrollIntoView` on the line, highlight on, cleared after 1.7 s (fake timers) — AC-77, AC-83
- [ ] same target works in Smart and Original order — AC-78
- [ ] line 999 → "Line 999 is not in the diff" at the file header — EC-15
- [ ] `file=../x` → "File not in this PR's diff", no file expanded; `line=abc` ignored — EC-16, UT-14
- [ ] existing DiffTab / FileCard tests stay green (no params = old behaviour)

### U7 — Brief service, repository, routes, wiring (server)
| Field | Value |
|---|---|
| Kind | backend (→ `implementer-backend`) |
| Wave | 2 |
| Depends on | U1, U2, U3 |
| Owns (create/modify) | `server/src/modules/brief/{service,repository,routes}.ts`; `server/src/modules/index.ts`; `server/src/platform/container.ts`; `server/test/brief-service.test.ts`; `server/test/brief-routes.test.ts`; `server/test/brief.it.test.ts` |
| Must not touch | U1/U2/U3 files, `adapters/llm/**`, `adapters/mocks.ts`, `reviewer-core/**`, migrations |
| Consumes | §3, all §3.4 functions |
| Produces | the 3 HTTP routes; `container.briefService`; override key `briefRepo` |
| Checks | `node scripts/agent-check.mjs server <owned files>` · depcruise `--ignore-known` |

**Steps**
1. `repository.ts` (Drizzle):
   - `getPull`: workspace-scoped join of `repos`;
   - `listPrFiles`;
   - `getIntent`;
   - `getStored`;
   - `upsert` with `onConflictDoUpdate` on `pr_id`.
2. `service.ts`:
   - **`getPage`**: 404 check, then `buildPage`.
   - **`candidates`**: `rankContextCandidates`.
   - **`generate`**, in this order:
     1. 404 check.
     2. In flight → `generating` + stored.
     3. Not `regenerate` and stored SHA == head → stored `generated`.
     4. 0 files → `refused/no_changed_files`.
     5. Resolve `risk_brief`; a `ConfigError` → 422 `model_not_configured`.
     6. Take the in-flight token and the deadline, and read the head SHA.
     7. Gather facts in parallel:
        - blast — a throw → `'unavailable'`;
        - smart-diff — a throw → roles null;
        - issue via `findLinkedIssue` + `github().getIssue` under the remaining time — failure → unresolved;
        - docs: explicit `context_paths` in the given order, else preselected candidates.
     8. `buildBriefInput`, then `fitToBudget`; not fitting → `refused/over_budget` with 0 calls.
     9. One `completeStructured({ schema: BriefDraft, maxTokens: 1500, maxRetries: 1, timeoutMs: remaining })` raced against the deadline.
     10. `groundBrief`.
     11. If not timed out and the token is current → `upsert` with provenance (SHA from step 6, real `apiCostUsd`).
     12. Write exactly one log line, then return `buildPage`.
   - Failures map to `failed` with `timeout|llm_error|invalid_output|store_failed` and the previous row unchanged.
   - The work is not tied to the request socket.
3. `routes.ts`: thin, zod schemas from §3.1/§3.2, rate limit on POST.
4. `container.ts`: `briefService` getter. Context-docs port over `projectContextService` (`list`, `workspaceAttachedPaths`, `readDocsForBrief`). `github: () => this.github()`. `loadPromptTemplate('brief.system.md')`. `GENERATION_DEADLINE_MS`. Override `briefRepo`. Register `brief` in `modules/index.ts`.

**Acceptance criteria**
- [ ] GET with stored brief → page and 0 LLM / 0 GitHub calls; empty → `none` with nulls — AC-1, AC-2, NFR-6
- [ ] stored SHA = head → `generated`; head updated → `outdated` with the brief unchanged (IT) — AC-3, AC-4
- [ ] blocked stub LLM: GET during the call → `generating`; 2 POSTs → 1 call — AC-5, EC-7
- [ ] POST with the mock fixture → `generated` with summary, risks, review_focus; second POST with `regenerate` → one row with the second content (IT) — AC-6, AC-12
- [ ] repair stub → 1 `completeStructured` call, `attempts = 2`; request `maxTokens = 1500`, `maxRetries = 1` — AC-7, NFR-2
- [ ] POST without `regenerate` on a current brief → 0 calls — AC-8
- [ ] `feature_models.risk_brief` override → stub receives that model; none → `gpt-4.1` (IT) — AC-9
- [ ] patch with `+SECRET_MARKER` / ` CTX_MARKER` → markers absent from messages, ranges present — AC-11
- [ ] provenance fields complete; the openai-style result → `cost_usd` null — AC-13
- [ ] schema-invalid after repairs → `failed/invalid_output`, nothing stored; truncated JSON → `failed` — AC-14, EC-4, UT-13
- [ ] no intent row → `intent_not_detected` and total LLM calls 1 — AC-15
- [ ] issue number → stub GitHub called once with it; throwing stub → `linked_issue_unresolved` — AC-19, EC-11
- [ ] grounding drops logged; exactly one `brief.generate` line with all NFR-4 fields and no hostile text — AC-28, NFR-4, NFR-5, UT-15
- [ ] no `context_paths` → preselected docs; explicit list → exactly those valid paths in order in provenance — AC-34, AC-35
- [ ] candidates route with a fixture clone of 3 docs → 3 entries (IT) — AC-37
- [ ] over budget → `refused/over_budget`, 0 calls; 0 files → `refused/no_changed_files`, 0 calls — AC-40, EC-1
- [ ] no key → HTTP 422 `model_not_configured` (IT) — EC-3
- [ ] throwing stub with a stored brief → `failed` + reason, row identical — EC-4, EC-24
- [ ] fake clock + slow stub → `failed/timeout` at 90 s; in-flight cleared; late result not stored — EC-6, NFR-3
- [ ] 11th POST within 1 min → 429 (IT) — EC-8
- [ ] throwing blast → `generated` + `blast_unavailable` — EC-10
- [ ] no clone → all docs `skipped_not_cloned` + `no_context_docs` — EC-12
- [ ] insert `{}` → GET `none` (IT) — EC-13
- [ ] other workspace → 404 on GET and POST (IT) — EC-14
- [ ] head moves during the call → stored under the start SHA, returned `outdated` — EC-19
- [ ] caller abandons the promise → row stored — EC-22
- [ ] FK cascade `0000_init.sql:386` noted (inspection) — EC-23
- [ ] the server parses one fixture of each §3.1 schema — AC-81 (unit part)

### U8 — Overview integration + navigation (client)
| Field | Value |
|---|---|
| Kind | ui (→ `implementer-ui`) |
| Wave | 2 |
| Depends on | U4, U5, U6 |
| Owns (create/modify) | `.../_components/OverviewTab/{OverviewTab.tsx,styles.ts,OverviewTab.test.tsx}`; `.../_components/IntentCard/{IntentCard.tsx,styles.ts}`; `.../pulls/[number]/page.tsx` |
| Must not touch | U4/U5/U6 owned files, `VerdictBanner/**`, messages |
| Consumes | U4 hooks + `PrBriefSection`; U5 `RiskAreas`, `ReviewFocus`; U6 `DiffTab` target props; `usePrIntent` |
| Produces | final Overview layout; `?tab=diff&file=&line=` navigation |
| Checks | `node scripts/agent-check.mjs client <owned files>` |

**Steps**
1. `IntentCard` gets an optional `riskSlot?: ReactNode`, rendered below a divider in the `full` variant only.
2. `OverviewTab` composes, top to bottom:
   - `PrBriefSection`;
   - when a brief is stored, a two-column row: left = IntentCard with `riskSlot = <RiskAreas variant="embedded">` when an intent exists, else `<RiskAreas variant="card">` in that slot; right = BlastRadius;
   - full-width `ReviewFocus`;
   - Description.

   With no brief the layout is today's.
3. `page.tsx`: `openDiffTarget(t)` → `router.push` to `?tab=diff&file=<enc>&line=<n>` (omit `line` when null). Pass `search.get('file'|'line')` to `DiffTab`. `setTab` stays `replace`.

**Acceptance criteria**
- [ ] brief + intent → "Risk areas" heading inside the Intent card — AC-51
- [ ] brief, no intent → Risk areas card in the Intent slot — AC-52
- [ ] Blast radius rendered beside the Intent / Risk column (order assertion) — AC-53
- [ ] Review focus block full width below — AC-58 (placement)
- [ ] focus click → `router.push('/repos/r/pulls/482?tab=diff&file=src%2Fconfig.ts&line=12')`; null line → no `line`; `push`, not `replace` — AC-74 (unit), AC-75
- [ ] opening Overview with a stored brief sends 0 POSTs — AC-71 (unit)
- [ ] IntentCard compact variant and existing Overview behaviour unchanged

### U9 — e2e flow for the seeded brief
| Field | Value |
|---|---|
| Kind | e2e (→ `implementer`) |
| Wave | 3 |
| Depends on | U3, U8 (and U6) |
| Owns (create/modify) | `e2e/specs/17-pr-brief.flow.json`; adjust `e2e/specs/02-repo-pulls-detail.flow.json` / `05-pr-diff.flow.json` only if a literal string they assert changed |
| Must not touch | app code, seed, `e2e/run.ts` |
| Consumes | seeded PR #482 brief (U3), UI strings (§3.5) |
| Produces | flow 17 |
| Checks | `node scripts/agent-check.mjs e2e e2e/specs/17-pr-brief.flow.json` · `./scripts/e2e.sh` |

**Steps**
1. Grep the existing flows for Overview strings first (`client/INSIGHTS.md:25`).
2. Flow:
   1. Open the root and go to PR #482.
   2. `wait --text` the seeded summary and "Review focus — read these first".
   3. Reload and assert the summary again.
   4. Click `src/config.ts:12`.
   5. `wait --url "tab=diff"` and `wait --url "file=src%2Fconfig.ts"`.
   6. `wait --text "stripeKey"` (file content visible).

**Acceptance criteria**
- [ ] seeded brief visible after reload without generation — AC-71 (e2e), G-1
- [ ] focus click opens Files changed with the URL and file content visible — AC-74 (e2e), AC-76 (e2e)
- [ ] all flows pass in the hermetic run

## 5. Waves (execution order)
**Before Wave 0:** commit `specs/2026-10-07-pr-brief.md` + this plan together (homework rule: spec and plan before any feature code). Then a cross-model review of this plan. Then `/impl docs/plans/pr-brief.md`.

| Wave | Units | Runs | Why this order |
|---|---|---|---|
| 0 | vendored `brief.ts` ×2 (§3.1) · `server/src/modules/brief/{constants,types,ports}.ts` (§3.3) · `client/src/lib/pr-diff-target.ts` + `client/messages/en/brief.json` (§3.5) | sequential, by the orchestrator | every unit compiles against these |
| 1 | U1, U2, U3, U4, U5, U6 | parallel | disjoint files; each consumes only Wave 0 |
| 2 | U7, U8 | parallel | U7 wires U1–U3; U8 composes U4–U6 |
| 3 | U9 | sequential | needs seed + final UI |

Commit per wave, then `plan-verifier` per wave (`scope=all` after Wave 3). No new migration (`pr_brief` exists, `0000_init.sql:211-214`). Serialized files: `modules/index.ts` and `container.ts` → U7 only; messages and vendor → Wave 0 only.

## 6. Test plan
| Package | Tests | Owner |
|---|---|---|
| server unit | `brief-{hunks,grounding,issue-ref,page,log}.test.ts` | U1 |
| server unit | `brief-{facts,budget,context-docs,prompt}.test.ts` | U2 |
| server unit + IT | `project-context-service.test.ts`, `project-context-brief.it.test.ts`, `seed-brief.test.ts` | U3 |
| server unit + IT | `brief-service.test.ts` (stub LLM: blocked, repair `attempts:2`, throwing, slow + fake clock; stub GitHub/blast; capture logger), `brief-routes.test.ts` (`app.inject` + `MockAuthProvider`), `brief.it.test.ts` (Postgres: AC-3/4/6/9/12/37, EC-3/8/13/14) | U7 |
| client | `lib/hooks/brief.test.ts`, `PrBriefSection` + child tests | U4 |
| client | `RiskAreas.test.tsx`, `ReviewFocus.test.tsx`, helpers tests | U5 |
| client | `DiffTab.test.tsx`, `helpers.test.ts`, `FileCard.test.tsx` | U6 |
| client | `OverviewTab.test.tsx` | U8 |
| e2e | `17-pr-brief.flow.json` | U9 |

EARS test shapes: WHILE rows (AC-5, AC-44, AC-68, AC-69, AC-72) assert entering and leaving the state. IF rows inject the failure (stubs, hostile fixtures, fake clock). AC-81 is an inspection that the two §3.1 blocks are byte-identical (orchestrator `diff`).

## 7. Verification (orchestrator, after merge)
1. Order: spec + plan commit → cross-model plan review → Waves 0–3 with a `plan-verifier` per wave → `plan-verifier scope=all` (0 open rows) → user OK → `spec-creator implemented SPEC-04` → `/pr-self-review`.
2. `cd server && pnpm typecheck && pnpm test`. Check the skipped IT count (`server/INSIGHTS.md:49`), then run `pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known`.
3. `cd client && pnpm typecheck && pnpm test`. Then run `next build` or `pnpm dev`, because a value import from the vendored barrel only fails there (`client/INSIGHTS.md:57`).
4. `./scripts/e2e.sh` (all flows).
5. Manual in the browser:
   - Generate on PR #482 with a real key.
   - Check that the file header is not hidden under the sticky PR header after navigation (AC-82).
   - Use Back to return to Overview.
6. Inspection: diff of the two vendored `brief.ts` PrBrief blocks is empty (AC-81).

## 8. Risks
- **Late LLM work after the deadline** keeps burning tokens in the background. Mitigation: token check before the store and the log; at most 2 attempts.
- **Vendored drift.** Edit only the PrBrief block in both copies. DET-003 will flag both files: `accept` with reason "SPEC-04 contract, identical in both copies".
- **depcruise.** `brief` must not import project-context, blast or smart-diff internals. All of them go through `container.ts` closures (`server/INSIGHTS.md:35`, `:39`). The baseline must not grow.
- **Seed insert-once** (`server/INSIGHTS.md:12`): `onConflictDoNothing` outside the guard. Verify on a throwaway DB.
- **e2e string coupling.** U8 keeps the Description and Intent strings; U9 greps the flows first.
- **Secret-shaped fixtures** (UT-6) are built at runtime (`server/INSIGHTS.md:59`), or DET-006 blocks the PR.
- **Prompt injection.** Every untrusted field is wrapped; reviewer-core guard and grounding gate untouched; the model output is grounded before it is stored.

## 9. Out of scope
Non-goals of SPEC-04: PR history in the brief, an MCP tool, auto-regeneration, auto intent detection, LLM doc ranking, sending hunk bodies or findings to the model.

### Spec follow-ups (owner: user / spec author)
none
