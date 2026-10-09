# Eval Pipeline (L06) — development plan

| Field | Value |
|---|---|
| Status | draft |
| Goal | An agent owner turns triaged findings into eval cases, runs the agent over its case set, gets code-scored recall / precision / citation accuracy, and compares two runs (SPEC-05 G-1…G-7). |
| Requirements source | [`specs/eval-pipeline.md`](../../specs/eval-pipeline.md) (SPEC-05, approved; AC-58 reserved, not planned) — input, never edited here |
| Execution mode | multi-agent (parallel waves) — chosen by the user |
| Packages touched | server · client · shared (vendored, both copies) |

## 1. Context
- Reserved, unused surface: tables `eval_cases` / `eval_runs` (`server/src/db/schema/eval.ts:7-35`, row = one case execution, `case_id NOT NULL` at `:24-26`, no owner FK at `:13`); contracts in `server/src/vendor/shared/contracts/knowledge.ts:28-63` and `eval-ci.ts:15-89` (mirrored in `client/src/vendor/shared/…`). The only consumer is `server/test/contracts.test.ts:130`, `:174`. i18n `client/messages/en/eval.json:1-84`; `/eval` active key `client/src/components/app-shell/helpers.ts:35`.
- Engine: `reviewPullRequest` (`reviewer-core/src/review/run.ts:154`) returns grounded `review.findings` + `dropped` (`:262-265`). It has no timeout or abort input (`:48-111`, `:212-219`). Live call site: `server/src/modules/reviews/run-executor.ts:218-250`.
- Next migration number: `0018` (`server/src/db/migrations/0017_onboarding_tour.sql`). Next sibling module to copy: `server/src/modules/brief/` (routes `brief/routes.ts:13-47`, container getter `server/src/platform/container.ts:383-414`).
- Seed: PR #482 has real hunks (`server/src/db/seed.ts:431-563`), inserted once under `if (!pr)` (`:403`). `seed(db)` is exported (`:316`).
- Constraints relied on: server INSIGHTS 2026-10-07 (timeouts apply per attempt; DET-006 fixtures built at runtime; `.it` tests skip silently), 2026-09-27 (container ↔ diff-loader cycle), 2026-09-22 (plain row interfaces in `ports.ts`), 2026-09-21 (`MockAuthProvider` for DB-free route tests); client INSIGHTS 2026-10-06 (tab whitelist derived from `TABS`), 2026-09-29 (`fireEvent`, no user-event; branch on `!data`), 2026-09-27 (type-only imports from `@devdigest/shared`), 2026-09-23 (vendored contract drift).

### Requirements review
Approved spec. The review round raised findings F1–F9, all resolved by the user's answers (2026-10-09):
- Q1 → multi-agent.
- Q2 → 120 s deadline enforced at executor level (I-1).
- Q3 → DB cascade (I-2).
- Q4 → separate idempotent seed + runbook.

Recommendations, all **accepted**:
- R1 — route map (§3.4).
- R2 — `renderSkillBlocks` moves to `_shared/skill-render.ts`.
- R3 — a single `loadPrDiff` in the container behind a `PrDiffSource` port.
- R4 — the fingerprint covers only skills actually sent to the prompt.
- R5 — shared rate-limit `groupId: 'eval-run-start'`.
- R6 — server-side LCS prompt diff.

**Interpretations recorded for plan-verifier.** Each deviates from or narrows the spec's literal wording.
- **I-1 (NFR-4, AC-22, AC-19).** A case "ends" when the executor records it `errored` with reason `timeout`. This happens no later than 120 s after the case started, and the next case then starts. Enforcement has three parts:
  - a `Promise.race` against a 120 s timer;
  - every `completeStructured` call receives `timeoutMs` = the remaining budget and `maxRetries ≤ 1`;
  - `checkCancelled` throws once the deadline has passed.

  An abandoned provider HTTP request may still finish in the background; its result and cost are discarded. reviewer-core is untouched, because adding an abort signal would modify reviewer-core's `OpenRouterProvider`.
- **I-2 (AC-75, EC-9).** "The API shall delete that agent's cases and runs" is implemented as `ON DELETE CASCADE` foreign keys `eval_cases.owner_id` / `eval_runs.owner_id → agents.id`; the agents module is untouched. EC-9: before each case the executor checks that its run row still exists, and stops if it does not. Consequence: future `owner_kind='skill'` rows would need their own column (out of scope).
- **I-3 (UT-2, AC-20).** The frozen PR title and body both go only into the untrusted `prDescription` slot. The `task` line is a fixed constant with no PR text.
- **I-4 (AC-11 + UT-8).** A generated name is truncated so that name plus suffix is ≤ 120 characters.
- **I-5 (AC-49 + AC-47 / UT-4).** Manual create applies the same AC-8, AC-9 and AC-14/14a rules as edit.
- **I-6 (AC-30).** The 5/min limit is one bucket shared by both start routes, keyed per IP. In this single-workspace local app, IP and workspace coincide.
- **I-7 (AC-53, AC-52).** Compare recomputes all deltas, cost included, from the stored per-case outcomes of the cases common to both runs.
- **I-8 (AC-29).** See OQ-1.

### Decisions
1. Reshape both tables in place with two drizzle passes: `0018` add, `0019` drop. This keeps drizzle-kit away from its rename prompt. The column `expected_output` keeps its name and holds `EvalExpectation`. Rejected: new tables (the reserved ones would be left dead).
2. Per-case outcomes are a jsonb array on the run row (`per_case`). List and dashboard queries never select it (NFR-3). Rejected: a third table — the outcomes are append-only and read whole.
3. In-flight guard (AC-25): a service check plus the unique partial index `eval_runs_one_running_uq (owner_id) WHERE status='running'`. An insert conflict maps to 409. Rejected: an in-memory set (does not survive a restart, and races).
4. The eval repository reads `findings`, `reviews`, `pull_requests`, `agents`, `agent_versions`, `agent_skills` and `skills` read-only, and writes only `eval_*` (onion rule 8). Only the PR diff and the LLM come through ports.
5. The frozen diff is extracted per file from the PR's current raw diff by an exact `+++ b/<path>` / `diff --git a/<p> b/<p>` match. Rejected: reviewer-core `sliceDiff` — it matches by substring and falls back to the whole diff (`reviewer-core/src/review/reduce.ts:58-72`).
6. AC-8 reuses `groundFindings` (`reviewer-core/src/grounding.ts:52`) with a synthetic `kind:'finding'`, so full-file kinds still need a line intersection (EC-15).
7. Background execution is fire-and-forget after the run row is inserted (`void exec().catch(log)`), and the client polls. No SSE, no jobs table.
8. Shared client eval UI lives in `client/src/components/eval/`. It has two consumers: the Evals tab and the `/eval` routes.
9. `GitCompare` is added to `client/src/vendor/ui/icons.tsx` (the vendored copy is the source, client INSIGHTS 2026-09-22).
10. The AC-12 link is `/agents/<agentId>?tab=evals&case=<caseId>`. The Evals tab opens the editor when `case` is present.

### Open questions
- **OQ-1 — AC-29 "older than 15 minutes".** A legitimate run of 50 cases × up to 120 s can last 100 min. Measuring age from the start time would kill live runs. **Default (planned):** age = time since the run's last progress. A `heartbeat_at` column is set at start and after each case, and the final update applies only `WHERE status='running'`. The spec's test (a `running` run with heartbeat 16 min old) holds unchanged. **Resolved 2026-10-09 by user: confirmed (heartbeat_at).**

## 2. Affected modules
| Package | Touched? | Why / what changes | Architecture rule that applies |
|---|---|---|---|
| server | yes | new `modules/eval/`, schema + 2 migrations, `_shared/secrets.ts` + `_shared/skill-render.ts`, container getter, registry, boot reconcile, seed, `verify:l06` | onion: routes → service → ports; repository ring 3; domain pure; depcruise baseline must not grow |
| client | yes | hooks, `components/eval/*`, Evals tab, `/eval` + `/eval/agents/[agentId]`, FindingCard action, nav entry, `eval.json` | frontend-ui-architecture: thin pages, `_components/<Name>/` + barrel, hooks over `api.ts` (unchanged) |
| reviewer-core | no | consumed only; grounding gate and `INJECTION_GUARD` untouched | `git diff reviewer-core/` empty |
| e2e | no | flows assert tab URLs, not the action row (spec Compatibility) | — |
| shared (vendored) | yes | eval blocks of `knowledge.ts` + `eval-ci.ts`, identical in both copies, Wave 0 | DET-003 accept with reason |

## 3. Contracts

### 3.1 Vendored contracts (identical in `server/` and `client/src/vendor/shared/contracts/`)
`knowledge.ts` — replace the `// ---- Eval ----` block (`:28-63`) with:
```ts
export const EvalOwnerKind = z.enum(['skill', 'agent']);
export type EvalOwnerKind = z.infer<typeof EvalOwnerKind>;
export const EvalExpectationType = z.enum(['must_find', 'must_not_flag']);
export type EvalExpectationType = z.infer<typeof EvalExpectationType>;
export const EvalExpectation = z
  .object({ type: EvalExpectationType, file: z.string().min(1),
            start_line: z.number().int().min(1), end_line: z.number().int().min(1) })
  .strict()
  .refine((e) => e.start_line <= e.end_line, { path: ['start_line'], message: 'start_line must be <= end_line' });
export type EvalExpectation = z.infer<typeof EvalExpectation>;
export const EvalCaseMeta = z.object({ pr_id: z.string().nullable(), pr_number: z.number().int().nullable(),
  title: z.string(), body: z.string().nullable() });
export type EvalCaseMeta = z.infer<typeof EvalCaseMeta>;
export const EvalCase = z.object({
  id: z.string(), owner_kind: EvalOwnerKind, owner_id: z.string(), name: z.string(), notes: z.string().nullable(),
  input_diff: z.string(), input_files: z.array(z.string()), input_meta: EvalCaseMeta, expectation: EvalExpectation,
  source_finding_id: z.string().nullable(), severity: z.string().nullable(), category: z.string().nullable(),
  created_at: z.string(), updated_at: z.string() });
export type EvalCase = z.infer<typeof EvalCase>;
export const EvalActualFinding = z.object({ file: z.string(), start_line: z.number().int(), end_line: z.number().int(),
  severity: z.string(), category: z.string(), title: z.string(), rationale: z.string(), matched: z.boolean() });
export const EvalCaseOutcome = z.object({
  case_id: z.string(), name: z.string(), expectation_type: EvalExpectationType,
  status: z.enum(['scored', 'errored']), pass: z.boolean().nullable(), error_reason: z.string().nullable(),
  findings_total: z.number().int(), findings_matched: z.number().int(),
  grounding_kept: z.number().int(), grounding_total: z.number().int(),
  actual: z.array(EvalActualFinding), duration_ms: z.number().int(), cost_usd: z.number().nullable() });
export type EvalCaseOutcome = z.infer<typeof EvalCaseOutcome>;
const Ratio = z.number().min(0).max(1).nullable();
export const EvalRunMetrics = z.object({ recall: Ratio, precision: Ratio, citation_accuracy: Ratio,
  cases_passed: z.number().int(), cases_total: z.number().int(), cases_errored: z.number().int(),
  uncovered_findings: z.number().int() });
export type EvalRunMetrics = z.infer<typeof EvalRunMetrics>;
export const EvalRun = EvalRunMetrics.extend({ per_case: z.array(EvalCaseOutcome) });
export type EvalRun = z.infer<typeof EvalRun>;
```
`eval-ci.ts` — replace the Eval section (`:15-89`), importing the names above from `./knowledge.js`:
```ts
const Name = z.string().trim().min(1).max(120); const Notes = z.string().max(2000);
export const EvalCaseInput = z.object({ name: Name, notes: Notes.nullish(), input_diff: z.string().min(1),
  pr_title: z.string(), pr_body: z.string().nullable(), expectation: EvalExpectation }).strict();
export const EvalCasePatch = z.object({ name: Name, notes: Notes.nullable(), input_diff: z.string().min(1),
  pr_title: z.string(), pr_body: z.string().nullable(), expectation: EvalExpectation }).partial().strict();
export const EvalCaseListItem = EvalCase.extend({ last: z.object({ run_id: z.string(),
  status: z.enum(['pass', 'fail', 'errored']), findings_matched: z.number().int().nullable() }).nullable() });
export const EvalCaseDetail = EvalCase.extend({
  source: z.object({ repo_id: z.string(), pr_number: z.number().int() }).nullable(), source_deleted: z.boolean(),
  last_outcome: z.object({ run_id: z.string(), outcome: EvalCaseOutcome }).nullable() });
export const EvalSkillRef = z.object({ skill_id: z.string(), name: z.string(), version: z.number().int() });
export const EvalRunStatus = z.enum(['running', 'completed', 'errored']);
export const EvalRunRecord = z.object({ id: z.string(), agent_id: z.string(), agent_name: z.string().nullable(),
  agent_version: z.number().int(), skills_fingerprint: z.array(EvalSkillRef), skills_delta: z.boolean(),
  status: EvalRunStatus, error_reason: z.string().nullable(), started_at: z.string(), finished_at: z.string().nullable(),
  duration_ms: z.number().int().nullable(), cost_usd: z.number().nullable(), case_ids: z.array(z.string()),
  metrics: EvalRunMetrics.nullable() });
export const EvalRunDetail = EvalRunRecord.extend({ per_case: z.array(EvalCaseOutcome) });
export const EvalRunEstimate = z.object({ agent_id: z.string(), cases_total: z.number().int() });
export const EvalRunStarted = z.object({ run_id: z.string(), status: z.literal('running') });
export const EvalRunAllResult = z.object({ results: z.array(z.object({ agent_id: z.string(), agent_name: z.string(),
  outcome: z.enum(['started', 'refused']), run_id: z.string().nullable(), reason: z.string().nullable() })) });
export const EvalTrendPoint = z.object({ run_id: z.string(), ran_at: z.string(), agent_version: z.number().int(),
  recall: Ratio, precision: Ratio, citation_accuracy: Ratio, cases_passed: z.number().int(), cases_total: z.number().int() });
export const EvalMetricKey = z.enum(['recall', 'precision', 'citation_accuracy']);
export const EvalBanner = z.object({ metric: EvalMetricKey, direction: z.enum(['up', 'down']), points: z.number(),
  agent_version: z.number().int(), transitions: z.array(z.object({ case_id: z.string(), name: z.string(),
  from: z.enum(['pass', 'fail']), to: z.enum(['pass', 'fail']) })) });
export const EvalAgentSummary = z.object({ agent_id: z.string(), agent_name: z.string(), model: z.string(),
  cases_total: z.number().int(), latest: EvalRunRecord.nullable(), trend: z.array(EvalTrendPoint) });
export const EvalDashboard = z.object({ agents: z.array(EvalAgentSummary), recent_runs: z.array(EvalRunRecord) });
export const EvalAgentDetail = z.object({ agent_id: z.string(), agent_name: z.string(), model: z.string(),
  cases_total: z.number().int(), running: EvalRunRecord.nullable(), latest: EvalRunRecord.nullable(),
  previous: EvalRunRecord.nullable(), runs: z.array(EvalRunRecord), trend: z.array(EvalTrendPoint),
  banner: EvalBanner.nullable() });
const Delta = z.object({ older: z.number().nullable(), newer: z.number().nullable(), delta: z.number().nullable() });
export const EvalCompare = z.object({ older: EvalRunRecord, newer: EvalRunRecord, common_case_ids: z.array(z.string()),
  only_in_older: z.array(z.object({ case_id: z.string(), name: z.string() })),
  only_in_newer: z.array(z.object({ case_id: z.string(), name: z.string() })),
  metrics: z.object({ recall: Delta, precision: Delta, citation_accuracy: Delta, cost_usd: Delta }),
  prompt_diff: z.array(z.object({ op: z.enum(['add', 'remove', 'same']), text: z.string() })).nullable(),
  missing_snapshot_versions: z.array(z.number().int()),
  skills_diff: z.array(z.object({ skill_id: z.string(), name: z.string(), change: z.enum(['added', 'removed', 'changed']),
    from_version: z.number().int().nullable(), to_version: z.number().int().nullable() })) });
export const EvalCompareQuery = z.object({ a: z.string().uuid(), b: z.string().uuid() });
```
Every schema exports its `z.infer` type with the same name.

### 3.2 DB (after `0018_eval_reshape_add.sql` + `0019_eval_reshape_drop.sql`)
- **`eval_cases`**
  - Changed columns: `owner_id` gains FK → `agents.id ON DELETE CASCADE`; `input_diff`, `input_files`, `input_meta` and `expected_output` become `NOT NULL`. `expected_output` holds an `EvalExpectation`.
  - Added columns: `source_finding_id uuid NULL` (no FK), `severity text NULL`, `category text NULL`, `created_at` / `updated_at timestamptz NOT NULL DEFAULT now()`.
  - Constraints and indexes: `UNIQUE (workspace_id, source_finding_id)` (multiple NULLs allowed); index `(workspace_id, owner_id)`.
- **`eval_runs`**
  - Added columns:
    - `workspace_id` (FK workspaces, cascade);
    - `owner_kind text NOT NULL`, `owner_id uuid NOT NULL` (FK → `agents.id ON DELETE CASCADE`);
    - `status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','errored'))`, `error_reason text`;
    - `agent_version int NOT NULL`, `skills_fingerprint jsonb NOT NULL DEFAULT '[]'`, `case_ids jsonb NOT NULL DEFAULT '[]'`;
    - `cases_passed`, `cases_total`, `cases_errored`, `uncovered_findings` (all `int`);
    - `per_case jsonb NOT NULL DEFAULT '[]'`;
    - `finished_at timestamptz`, `heartbeat_at timestamptz NOT NULL DEFAULT now()`.
  - Kept as-is: `ran_at` (= started_at), `recall`, `precision`, `citation_accuracy`, `duration_ms`, `cost_usd`.
  - Dropped in 0019: `case_id`, `actual_output`, `pass`.
  - Indexes: `(workspace_id, owner_id, ran_at DESC)`; unique partial `eval_runs_one_running_uq (owner_id) WHERE status = 'running'`.

### 3.3 Server ports and domain signatures (`server/src/modules/eval/`)
```ts
// ports.ts (Wave 0) — plain interfaces only, no ORM / adapter imports
export interface FindingSource { finding_id: string; file: string; start_line: number; end_line: number; title: string;
  severity: string; category: string; accepted_at: string | null; dismissed_at: string | null; agent_id: string | null;
  pr_id: string; pr_number: number; pr_title: string; pr_body: string | null }
export interface AgentSnapshot { agent_id: string; name: string; provider: Provider; model: string; system_prompt: string;
  strategy: ReviewStrategy | null; version: number;
  skills: { skill_id: string; name: string; type: string; body: string; enabled: boolean; version: number }[] }
export interface NewCase { workspace_id: string; owner_id: string; name: string; notes: string | null; input_diff: string;
  input_files: string[]; input_meta: EvalCaseMeta; expectation: EvalExpectation; source_finding_id: string | null;
  severity: string | null; category: string | null }
export interface NewRun { workspace_id: string; owner_id: string; agent_version: number;
  skills_fingerprint: EvalSkillRef[]; case_ids: string[] }
export interface RunResult { metrics: EvalRunMetrics; per_case: EvalCaseOutcome[]; duration_ms: number; cost_usd: number | null }
export interface EvalRepositoryPort {
  findingSource(ws: string, findingId: string): Promise<FindingSource | null>;
  findingLink(ws: string, findingId: string): Promise<{ repo_id: string; pr_number: number } | null>;
  caseBySourceFinding(ws: string, findingId: string): Promise<EvalCase | null>;
  caseNames(ws: string, agentId: string): Promise<string[]>;
  insertCase(c: NewCase): Promise<{ case: EvalCase; created: boolean }>; // ON CONFLICT (ws, source_finding_id) → existing
  getCase(ws: string, id: string): Promise<EvalCase | null>;
  listCases(ws: string, agentId: string): Promise<EvalCase[]>;
  countCases(ws: string, agentId: string): Promise<number>;
  updateCase(ws: string, id: string, patch: Partial<NewCase>): Promise<EvalCase | null>;
  deleteCase(ws: string, id: string): Promise<boolean>;
  agentSnapshot(ws: string, agentId: string): Promise<AgentSnapshot | null>;
  agentSystemPrompt(agentId: string, version: number): Promise<string | null>; // agent_versions.config_json.system_prompt
  agentsWithCases(ws: string): Promise<{ agent_id: string; name: string; model: string; cases_total: number }[]>;
  reconcileStale(cutoff: Date, ws?: string): Promise<number>; // running AND heartbeat_at < cutoff → errored 'interrupted'
  runningRun(ws: string, agentId: string): Promise<EvalRunRecord | null>;
  insertRun(r: NewRun): Promise<string | null>;               // null on eval_runs_one_running_uq conflict
  runExists(id: string): Promise<boolean>;
  heartbeat(id: string): Promise<void>;
  completeRun(id: string, r: RunResult): Promise<void>;        // WHERE status='running'
  failRun(id: string, reason: string): Promise<void>;          // WHERE status='running'
  getRun(ws: string, id: string): Promise<EvalRunDetail | null>;
  listRuns(ws: string, agentId: string): Promise<EvalRunRecord[]>;   // newest first, no per_case; skills_delta=false
  recentRuns(ws: string, limit: number): Promise<EvalRunRecord[]>;   // no per_case
  completedOutcomes(ws: string, agentId: string, limit: number): Promise<{ run_id: string; per_case: EvalCaseOutcome[] }[]>;
}
export interface PrDiffSource { loadPrDiff(ws: string, prId: string): Promise<UnifiedDiff> }
export interface DiffParser { parse(raw: string): UnifiedDiff }
export type LlmResolver = (provider: Provider) => Promise<LLMProvider>; // throws ConfigError when the key is missing
export interface EvalLog { info(obj: Record<string, unknown>, msg: string): void; error(obj: Record<string, unknown>, msg: string): void }
// constants.ts (Wave 0)
export const EVAL_CASE_DEADLINE_MS = 120_000, EVAL_MAX_REPAIR_RETRIES = 1, EVAL_STALE_RUN_MS = 15 * 60_000,
  EVAL_MAX_CASES = 50, EVAL_MAX_FROZEN_DIFF_BYTES = 204_800, EVAL_RECENT_RUNS = 20, EVAL_NAME_MAX = 120,
  EVAL_RUN_RATE_LIMIT = { max: 5, timeWindow: '1 minute', groupId: 'eval-run-start' } as const,
  EVAL_TASK_LINE = 'Review the changes in this eval case diff.';
```
Domain functions (Wave 1; consumed by U8 and U11):
- **`_shared/secrets.ts`**
  - `maskSecretsForStorage(text): string` — whole PEM blocks first (AC-14a), then token placeholders (AC-14). Deterministic and length-preserving.
  - `secretPrefix(match): string` — the fixed literal part of the match: `AKIA`, `AIza`, `ghp_` / `ghs_`, `npm_`, `xox?-`, `sk_live_`.
- **`_shared/skill-render.ts`**: `renderSkillBlocks(links)`, moved unchanged, plus `SkillLinkForPrompt`.
- **`domain/frozen-input.ts`**
  - `extractFileDiff(raw, path): string | null`
  - `diffByteSize(text): number`
  - `expectationIntersectsHunk(diff: UnifiedDiff, e: EvalExpectation): boolean`
- **`domain/naming.ts`**: `caseNameFromTitle(title, findingId, existing: readonly string[]): string`.
- **`domain/skills.ts`**
  - `promptSkills(skills)` — enabled and not `hasInjection`, in link order.
  - `fingerprint(promptSkills): EvalSkillRef[]`
- **`domain/scoring.ts`**
  - `matches(finding, e): boolean`
  - `scoreCase(caseRef, exec: CaseExecution): EvalCaseOutcome`
  - `erroredOutcome(caseRef, reason, durationMs): EvalCaseOutcome`
  - `scoreRun(outcomes): EvalRunMetrics`
  - `runCost(outcomes): number | null`
- **`domain/compare.ts`**
  - `compareRuns(older: EvalRunDetail, newer: EvalRunDetail, prompts: { older: string | null; newer: string | null }): EvalCompare`
  - `promptLineDiff(a, b)` (LCS)
  - `skillsDiff(a, b)`
  - `markSkillsDelta(runsNewestFirst): EvalRunRecord[]`
- **`domain/banner.ts`**: `buildBanner(latest: EvalRunDetail, previous: EvalRunDetail): EvalBanner | null`.
- **`executor.ts`**: `runCase(input: { snapshot: AgentSnapshot; skillBlocks: string[]; evalCase: EvalCase; llm: LLMProvider; parser: DiffParser; now?: () => number }): Promise<CaseExecution>`. The `CaseExecution` type is `{ findings: Finding[]; grounding_kept; grounding_total; duration_ms; cost_usd: number | null }`; the function throws `EvalCaseError(reason)`.

### 3.4 HTTP (R1). Every route calls `getContext` first, is workspace-scoped (404 for another workspace), and declares zod schemas
| Method · path | Body / query → response | Errors |
|---|---|---|
| POST `/findings/:id/eval-case` | — → 201 / 200 `EvalCase` | 422 `finding_not_triaged` · `expectation_outside_diff` · `frozen_input_too_large` · `agent_unavailable` · `diff_unavailable` |
| GET `/agents/:id/eval-cases` | → `EvalCaseListItem[]` | 404 |
| POST `/agents/:id/eval-cases` | `EvalCaseInput` → 201 `EvalCase` | 422 field path / AC-8 / AC-9 codes |
| GET / PATCH / DELETE `/eval-cases/:id` | GET → `EvalCaseDetail`; PATCH `EvalCasePatch` → `EvalCase`; DELETE → 204 | 404, 422 |
| GET `/agents/:id/eval-runs/estimate` | → `EvalRunEstimate` | 404 |
| POST `/agents/:id/eval-runs` | — → 202 `EvalRunStarted` | 409 `run_in_flight`, 422 `no_cases` / `provider_key_missing` / `too_many_cases`, 429 |
| GET `/agents/:id/eval-runs` | → `EvalRunRecord[]` (newest first) | 404 |
| GET `/eval-runs/:id` | → `EvalRunDetail` (poll target) | 404 |
| POST `/eval-runs/all` | — → 200 `EvalRunAllResult` | 429 |
| GET `/eval-runs/compare?a&b` | `EvalCompareQuery` → `EvalCompare` | 422 `invalid_compare_pair`, 404 |
| GET `/eval/dashboard` · GET `/eval/agents/:id` | → `EvalDashboard` · `EvalAgentDetail` | 404 |

Both POST run routes carry `config.rateLimit = EVAL_RUN_RATE_LIMIT`. POST bodies that are optional use `.nullish()` (server INSIGHTS 2026-10-07).

### 3.5 i18n `client/messages/en/eval.json` (Wave 0)
- **Keep:** `dashboard.*`, `page.*`, `evalsTab.{metricsTitle,casesHeading,newCase,run,running,edit,delete}`, `caseEditor.{newCase,caseTitle,save,saving,nameLabel,titleLabel,bodyLabel,tabs.diff,tabs.prMeta}`.
- **Remove:** `caseEditor.{validJson,invalidJson,resultSummary,expectedOutput,runCase,preview}`, `evalsTab.{recallSuffix,emptyCases,neverRun,passed,failed}`.
- **Add (exact English copy from the spec quotes):**
  - Finding action: `finding.{turnInto,eligibleHint,done}`.
  - Pills and statuses: `pill.{mustFind,mustNotFlag}`, `status.{pass,fail,errored,neverRun,running,completed}`.
  - Expectation text: `banner.{positive,negative}` (AC-81, `{file}` `{start}` `{end}`); `expected.{mustFind,mustNotFlag,got}` (AC-84).
  - Metrics: `metrics.{recall,precision,citation,casesPassed,notApplicable,deltaPts}`; `passingBadge` (AC-85); `uncovered` (AC-42); `scoringNote` (AC-86).
  - Empty and run states: `empty.{noCases,howToCreate,neverRun,runAgain}`; `run.{confirmOne,confirmAll,start,startAll,runningSince,refreshFailed}`.
  - Errors: `errors.{run_in_flight,no_cases,provider_key_missing,too_many_cases,finding_not_triaged,expectation_outside_diff,frozen_input_too_large,agent_unavailable,diff_unavailable,invalid_compare_pair,generic}`.
  - Compare: `compare.{title,action,older,newer,onlyInOlder,onlyInNewer,promptDiff,snapshotUnavailable,skills,skillAdded,skillRemoved,skillChanged}`.
  - Insight banner: `insight.{withCases,noCases}` (AC-69, AC-70, EC-23).
  - Dashboard and pages: `dashboard.{notRanking,runAllAgents,trendTable}`; `versionLabel`, `versionSkillsDelta` (AC-56); `caseEditor.{tabs.files,expectation,type,file,startLine,endLine,notes,sourceLink,sourceDeleted,deleteConfirm,lastOutcome}`.

## 4. Work units
`node scripts/agent-check.mjs <pkg> <files>` stands for "agent-check over the unit's owned files". Server units also run `cd server && pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known`.

### U0 — Vendored eval contracts + parity test
| Field | Value |
|---|---|
| Kind | backend (Wave 0, orchestrator) |
| Wave | 0 |
| Depends on | none |
| Owns (create/modify) | `server/src/vendor/shared/contracts/{knowledge,eval-ci}.ts`, `client/src/vendor/shared/contracts/{knowledge,eval-ci}.ts`, `server/test/contracts.test.ts`, `server/test/eval-contract-parity.test.ts` |
| Must not touch | any other block of the vendored files (pre-existing drift, client INSIGHTS 2026-09-23) |
| Consumes | — |
| Produces | §3.1 |
| Checks | `node scripts/agent-check.mjs server <owned server files>` · `cd client && pnpm typecheck` |

**Steps**
1. Replace only the two eval blocks, byte-identically in both copies.
2. Update the `EvalRun` fixture at `contracts.test.ts:174`.
3. Write the parity test: it reads the 4 files from disk and asserts the eval regions (`// ---- Eval ----` up to `// ---- Memory ----`, and the Eval banner up to `// Compose Review`) are equal.

**Acceptance criteria**
- [ ] Parity test passes, and fails when one copy is altered — SPEC-05 AC-80.
- [ ] `EvalExpectation` rejects `type:"maybe"`, `{"type":{"$gt":""}}`, an extra `__proto__` key, `start_line > end_line`, lines `< 1` and an empty file, each with its issue path — AC-47, UT-7.
- [ ] `EvalCaseInput` rejects a name of 121 chars and notes of 2001 chars with the field path — UT-8.

### U1 — Schema, migrations, module ports + constants
| Field | Value |
|---|---|
| Kind | backend (Wave 0, orchestrator) |
| Wave | 0 |
| Depends on | U0 |
| Owns (create/modify) | `server/src/db/schema/eval.ts`, `server/src/db/migrations/0018_eval_reshape_add.sql`, `0019_eval_reshape_drop.sql`, `server/src/db/migrations/meta/*` (generated), `server/src/modules/eval/{ports,constants}.ts` |
| Must not touch | applied migrations `0000`–`0017` |
| Consumes | §3.1 |
| Produces | §3.2, §3.3 ports + constants |
| Checks | `pnpm typecheck` · `pnpm db:generate` twice (`--name eval_reshape_add`, then `--name eval_reshape_drop`, stdin closed) · depcruise |

**Steps**
1. Pass 1: add the columns, FKs, NOT NULLs, uniques and indexes of §3.2, then generate 0018. Pass 2: remove the three columns, then generate 0019. Inspect both SQL files: there must be no rename and no drop in 0018.
2. Write `ports.ts` / `constants.ts` exactly as in §3.3. Plain interfaces only (server INSIGHTS 2026-09-22).

**Acceptance criteria**
- [ ] `pnpm db:migrate` on a fresh DB applies 0018 + 0019, and the resulting schema matches §3.2 — AC-23 data shape, AC-43 (no FK from runs to cases).
- [ ] FK cascade `owner_id → agents` exists on both tables — AC-75 (I-2).
- [ ] `UNIQUE (workspace_id, source_finding_id)` — AC-2. The partial unique running index — AC-25.

### U2 — i18n namespace rework
| Field | Value |
|---|---|
| Kind | ui (Wave 0, orchestrator) |
| Wave | 0 |
| Depends on | none |
| Owns (create/modify) | `client/messages/en/eval.json` |
| Must not touch | other message files |
| Consumes | — |
| Produces | §3.5 keys |
| Checks | `cd client && pnpm typecheck` · JSON parse |

**Steps:** apply §3.5. ICU placeholders: `{file}`, `{start}`, `{end}`, `{count}`, `{agents}`, `{executions}`, `{passed}`, `{total}`, `{version}`, `{points}`, `{metric}`, `{cases}`.

**Acceptance criteria**
- [ ] Every key listed in §3.5 exists. `assert empty` is absent — NFR-10, AC-87.

### U3 — Server domain A: secrets placeholder, skill render, frozen input, naming, fingerprint
| Field | Value |
|---|---|
| Kind | backend |
| Wave | 1 |
| Depends on | U0, U1 |
| Owns (create/modify) | `server/src/modules/_shared/secrets.ts`, `server/src/modules/_shared/skill-render.ts` (new), `server/src/modules/reviews/helpers.ts` (replace the body of `renderSkillBlocks` with a re-export), `server/src/modules/eval/domain/{frozen-input,naming,skills}.ts`, tests `server/test/eval-secret-placeholder.test.ts`, `eval-frozen-input.test.ts`, `eval-naming.test.ts`, `eval-skills.test.ts` |
| Must not touch | `redactSecretValues` / `containsSecretValue` behaviour; `reviews/run-executor.ts` |
| Consumes | §3.3 constants |
| Produces | §3.3 functions for these files |
| Checks | `node scripts/agent-check.mjs server <owned>` · depcruise |

**Steps**
1. PEM matcher: BEGIN…END blocks, also when the lines carry a diff prefix. The body characters get a fixed filler; line lengths and `+`/`-`/space prefixes are kept.
2. Token placeholder: the fixed literal prefix plus a filler `X…` up to the original length.
3. Implement `extractFileDiff` (exact path match), `expectationIntersectsHunk` (`groundFindings` with a synthetic `kind:'finding'`), kebab naming with `-2`, `-3`…, the `case-<8>` fallback and 120-char truncation, and `promptSkills` / `fingerprint`.
4. Fixtures are built at runtime (DET-006).

**Acceptance criteria**
- [ ] A Stripe-shaped token becomes a same-length placeholder that keeps the `sk_live_` prefix and drops the original; the stored diff keeps its line count — AC-14, UT-3, EC-20.
- [ ] A full PEM block in a diff: no original body line remains; BEGIN/END are kept; line count, line lengths and prefixes are equal; two runs give identical output — AC-14a.
- [ ] Two-file diff → only the requested file with all its hunks; an absent file → `null` — AC-7, EC-2.
- [ ] `expectationIntersectsHunk` is false outside every hunk, including for a range that came from a full-file kind — AC-8, EC-1, EC-15.
- [ ] A 201 KB diff exceeds `EVAL_MAX_FROZEN_DIFF_BYTES` — AC-9, UT-4.
- [ ] "Hardcoded Stripe secret key" → `hardcoded-stripe-secret-key`, then `…-2`; punctuation only → `case-<8 chars>`; ≤ 120 chars — AC-11, EC-21, I-4.
- [ ] `promptSkills` drops disabled and injection-flagged skills; `fingerprint` lists `{skill_id,name,version}` — AC-18 (R4).
- [ ] Existing `reviews` and `skill-injection` tests stay green (no behaviour change from R2).

### U4 — Server domain B: scoring, compare, banner, executor
| Field | Value |
|---|---|
| Kind | backend |
| Wave | 1 |
| Depends on | U0, U1 |
| Owns (create/modify) | `server/src/modules/eval/domain/{scoring,compare,banner}.ts`, `server/src/modules/eval/executor.ts`, tests `server/test/eval-scoring.test.ts`, `eval-compare.test.ts`, `eval-banner.test.ts`, `eval-executor.test.ts` |
| Must not touch | `reviewer-core/**` |
| Consumes | §3.1, §3.3 ports/constants |
| Produces | §3.3 functions for these files |
| Checks | `node scripts/agent-check.mjs server <owned>` · depcruise |

**Steps**
1. Scoring:
   - match rule: same file and an inclusive range intersection;
   - precision = 1 − FP/T over grounded findings of scored cases;
   - errored cases are excluded from every metric;
   - a zero denominator gives `null`;
   - `uncovered_findings` counts non-matching grounded findings.
2. `compareRuns` restricts both runs to their common case ids, then rescores (I-7). `promptLineDiff` is an LCS. `markSkillsDelta` compares each run with the nearest earlier completed run of the same version.
3. `buildBanner` picks the metric with the largest |Δ|, its direction and size in points (×100, rounded), and the pass/fail transitions.
4. Executor (I-1, I-3):
   - Call `reviewPullRequest` with only `systemPrompt`, `model`, the parsed frozen diff, `llm`, `strategy`, `skills` (when non-empty), `prDescription` = title + body, and `task: EVAL_TASK_LINE`.
   - Deadline wrapper: race against the 120 s timer; pass the remaining-budget `timeoutMs` and `maxRetries ≤ EVAL_MAX_REPAIR_RETRIES`; `checkCancelled` throws past the deadline.
   - `grounding_kept = review.findings.length`; `grounding_total = kept + dropped.length`; cost = `apiCostUsd`.

**Acceptance criteria**
- [ ] Scoring completes with a provider stub that throws on any call (0 calls) — AC-35, NFR-1.
- [ ] Match table — 1-line overlap, adjacent ranges, other file, reversed range, many-line span — AC-36, EC-14.
- [ ] Recall 3/4 = 0.75; precision with one must_not_flag case, 4 findings and 1 overlap = 0.75; citation 3 kept of 4 = 0.75 — AC-37, AC-38, AC-39.
- [ ] Only must_not_flag cases → recall null; zero findings → precision and citation null; all cases errored → all null with `cases_errored = n` — AC-40, EC-12, EC-16.
- [ ] 1 errored of 3 → metrics over 2 cases and `cases_errored = 1` — AC-41. Findings outside every expectation do not lower precision and add to `uncovered_findings` — EC-13, AC-42.
- [ ] `score(x)` deep-equals `score(x)` over generated outcomes — NFR-2.
- [ ] Compare with different case sets: deltas use the common cases; `only_in_*` lists the rest — AC-53, EC-17. Prompt diff of a one-line change → one `remove` + one `add` — AC-54. Skill v2→v3 → `changed` — AC-55. Two v7 runs with different fingerprints → the second has `skills_delta` — AC-56. A null prompt → `prompt_diff: null` + `missing_snapshot_versions` — AC-57.
- [ ] Banner: precision 0.93 → 0.91 on v7 → `{precision, down, 2, 7}`; a must_not_flag case pass→fail is in `transitions`; no flips → empty transitions — AC-69, AC-70, EC-23.
- [ ] Captured messages hold the system prompt and the frozen diff, and none of the repo-map / callers / project-context / intent / memory headings — AC-20.
- [ ] A hostile diff and a hostile PR body appear only inside the untrusted blocks — UT-1, UT-2.
- [ ] The same case assembled twice gives identical message arrays — AC-21.
- [ ] A hanging provider (fake timers) → `EvalCaseError('timeout')` at 120 s; every provider call received `timeoutMs ≤ remaining` and `maxRetries ≤ 1`; a throwing provider → error with its reason — AC-22, NFR-4, EC-10 (I-1).
- [ ] An expectation file `../../etc/passwd` scores normally; an `fs` spy records no access — UT-5.

### U5 — Eval repository (Drizzle)
| Field | Value |
|---|---|
| Kind | backend |
| Wave | 1 |
| Depends on | U1 |
| Owns (create/modify) | `server/src/modules/eval/{repository,mappers}.ts`, `server/test/eval-repository.it.test.ts` |
| Must not touch | other modules' repositories; no writes to non-`eval_*` tables |
| Consumes | §3.2, `EvalRepositoryPort` |
| Produces | `EvalRepository implements EvalRepositoryPort` |
| Checks | `node scripts/agent-check.mjs server --it <owned>` · depcruise |

**Steps**
1. Implement every port method, with `workspace_id` in each WHERE clause. `findingSource` joins `findings → reviews → pull_requests`.
2. `agentSnapshot` reads `agents` + `agent_skills` + `skills`.
3. `insertCase` uses `ON CONFLICT DO NOTHING` and then selects the existing row; `insertRun` maps the unique violation to `null`.
4. Mapping in `mappers.ts`. List queries never select `per_case`.

**Acceptance criteria**
- [ ] Deleting an agent removes its cases and runs — AC-75.
- [ ] Concurrent `insertCase` for one finding → one row, `created` true exactly once — AC-2, EC-4. A second `insertRun` while one is running → `null` — AC-25, EC-5.
- [ ] `reconcileStale` marks only runs whose heartbeat is older than the cutoff, with reason `interrupted` — AC-29 (OQ-1).
- [ ] `completeRun` / `failRun` do not touch a non-running row.
- [ ] Every method returns null / empty for another workspace's ids — NFR-11, UT-11.

### U6 — Client data layer + run control + finding action
| Field | Value |
|---|---|
| Kind | ui |
| Wave | 1 |
| Depends on | U0, U2 |
| Owns (create/modify) | `client/src/lib/hooks/eval.ts`, `client/src/lib/hooks/eval.test.ts`, `client/src/lib/hooks/index.ts`, `client/src/components/eval/RunEvalControl/*` (incl. test), `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/{FindingCard.tsx,FindingCard.test.tsx}`, `…/FindingCard/_components/EvalCaseAction/*` (incl. test) |
| Must not touch | `client/src/lib/api.ts`; Accept/Dismiss behaviour |
| Consumes | §3.1 types (type-only imports), §3.4, §3.5 |
| Produces | hooks: `useEvalCases`, `useEvalCase`, `useCreateEvalCaseFromFinding`, `useCreateEvalCase`, `useUpdateEvalCase`, `useDeleteEvalCase`, `useEvalEstimate`, `useStartEvalRun`, `useRunAllEvals`, `useEvalRuns`, `useEvalRun`, `useEvalAgentDetail`, `useEvalDashboard`, `useEvalCompare`; `<RunEvalControl agentId detail />` |
| Checks | `node scripts/agent-check.mjs client <owned files, explicit>` |

**Steps**
1. Hooks follow `lib/hooks/agents.ts`. `useEvalRun` polls every 3 s only while `status==='running'`; on the terminal status it invalidates the cases, runs and detail queries. Mutations invalidate their lists.
2. `RunEvalControl` gives the "Run all evals" flow:
   - confirm with the case count from the estimate, then POST;
   - the running indicator with the start time replaces the enabled actions;
   - a refusal or `errored` reason (from `ApiError.code` → `errors.*`) is shown next to the action;
   - a polite live region announces the status;
   - a poll failure keeps the last state and shows `run.refreshFailed`.
3. `EvalCaseAction`:
   - disabled with the hint while the finding is untriaged;
   - on success it becomes "Eval case ✓", a link to `/agents/<owner_id>?tab=evals&case=<id>`.

**Acceptance criteria**
- [ ] Untriaged → disabled with "Accept or dismiss first"; with `accepted_at` set → enabled — AC-3.
- [ ] A mocked 201 or 200 → "Eval case ✓" control with that href — AC-12. The action is operable by Enter / Space — NFR-9.
- [ ] Estimate 8 → confirmation shows 8 and no POST happens before confirm — AC-31.
- [ ] Fake timers: GET is re-issued every 3 s and stops after `completed` (assert on `getQueryData`) — AC-32.
- [ ] A mocked 409 / 422 shows the reason text — AC-74. A running run shows the indicator with its start time — EC-25, EC-6. The live region text changes on `completed` — NFR-13.

### U7 — Client presentational eval components
| Field | Value |
|---|---|
| Kind | ui |
| Wave | 1 |
| Depends on | U0, U2 |
| Owns (create/modify) | `client/src/lib/eval-format.ts` + `.test.ts`; `client/src/components/eval/{ExpectationPill,MetricTiles,RunsTable,MetricTrend,TrendSparkline,TruncatedText}/*` (each with `index.ts` + test) |
| Must not touch | `client/src/vendor/ui/**` |
| Consumes | §3.1 types, §3.5 |
| Produces | the components above (props only, no hooks for server data) |
| Checks | `node scripts/agent-check.mjs client <owned files>` |

**Steps**
1. Formatting:
   - percent, or `notApplicable` for null;
   - a signed delta in points;
   - the cost via the existing `format-cost`, or "—" when null;
   - the version label `vN` or `vN · skills Δ`.
2. `MetricTiles`: 4 tiles with an optional delta.
3. `RunsTable`: time, version label, metrics, passed, cost, status. Optional checkbox selection is reported through `onSelectionChange`.
4. `MetricTrend`: `LineChart` plus a visually-hidden table with the same values.
5. `TrendSparkline`: wrapped `aria-hidden`.
6. `TruncatedText`: an ellipsis with the full text as the accessible name.

**Acceptance criteria**
- [ ] A null metric renders "n/a" — AC-40.
- [ ] A null cost renders "—" — NFR-6.
- [ ] Every pass/fail/status cell has text, not only colour — NFR-8.
- [ ] Pills read "MUST FIND" / "MUST NOT FLAG" — AC-87.
- [ ] The sparkline svg is inside `aria-hidden="true"`, and a table equivalent holds the same values — AC-83, NFR-12.
- [ ] A 200-char name or a long path is truncated, with the full accessible name — EC-19.
- [ ] RunsTable lists 3 runs in the given order with the listed fields — AC-61.

### U8 — Eval service, routes, wiring, boot reconcile
| Field | Value |
|---|---|
| Kind | backend |
| Wave | 2 |
| Depends on | U1, U3, U4, U5 |
| Owns (create/modify) | `server/src/modules/eval/{service,routes,types}.ts`, `server/src/platform/container.ts`, `server/src/modules/index.ts`, `server/src/server.ts`, `server/test/helpers/eval-fakes.ts`, `server/test/eval-service.test.ts`, `server/test/eval-routes.test.ts` |
| Must not touch | `modules/agents/**`, `modules/reviews/**`, `reviewer-core/**` |
| Consumes | all §3 |
| Produces | the live API of §3.4 |
| Checks | `node scripts/agent-check.mjs server <owned>` · depcruise (baseline unchanged) |

**Steps**
1. Container:
   - `private loadPrDiff`, reused by `intentService` and eval (R3);
   - `get evalService()` with deps `{ repo, diffs, parser: { parse: parseUnifiedDiff }, llm, log }`;
   - a `ContainerOverrides.evalRepo` key.
2. `createFromFinding(ws, findingId)`, in this order:
   - 404 when the finding is missing;
   - existing case → 200;
   - untriaged → `finding_not_triaged`;
   - `agent_id` null → `agent_unavailable`;
   - `loadPrDiff` + `extractFileDiff` (null → `diff_unavailable`);
   - size check (`frozen_input_too_large` with size and limit);
   - mask secrets (diff, title, body, name);
   - hunk check (`expectation_outside_diff` naming the file and range);
   - insert.
   The type comes from whichever of `accepted_at` / `dismissed_at` is set; if both are set, the later one wins.
3. `createManual` and `patch` apply the same masking, size and hunk rules (I-5). `input_files` = the parsed diff paths. A patch never touches runs.
4. `startRun(ws, agentId)`, in this order:
   - 404 when the agent is missing;
   - `reconcileStale`;
   - `running` exists → `run_in_flight`;
   - 0 cases → `no_cases`;
   - more than 50 → `too_many_cases`;
   - `llm(provider)` throws `ConfigError` → 422 `provider_key_missing` naming the provider;
   - snapshot (prompt, model, `promptSkills`, `renderSkillBlocks`, fingerprint, version) and the case set;
   - `insertRun` (null → 409);
   - return 202, then `void execute()`.
5. `execute` runs one case at a time:
   - before each case: `runExists` (false → stop, EC-9), then `runCase`, then `scoreCase` or `erroredOutcome`, then `heartbeat`;
   - at the end: `completeRun`, or `failRun` on an outer error;
   - one log line per run with ids, counts, metrics, model, tokens, duration and cost only.
6. `runAll` loops over `agentsWithCases` and maps each AppError code to `refused`.
7. Read paths: list, detail, dashboard, compare (422 when the ids are equal or the agents differ), and the per-case `last` from `completedOutcomes`. None of them builds an LLM.
8. Routes per §3.4 with the shared rate limit. `server.ts` calls `reconcileStale` once after `buildApp`, inside try/catch.

**Acceptance criteria** (unit tests with fake repo / `app.inject` + `MockAuthProvider` + a stub LLM)
- [ ] Dismissed finding → 201 `must_not_flag`; accepted → `must_find` with the finding's file and lines; a second POST → 200 with the same id — AC-1, AC-2, AC-5, AC-6, EC-3.
- [ ] 422 codes: untriaged — AC-4; outside the hunks — AC-8, EC-1; no file diff — EC-2; null agent — AC-13; over 200 KB — AC-9, UT-4.
- [ ] A later dismiss leaves the stored `must_find` — AC-10.
- [ ] PATCH with a valid expectation → 200; `type:"maybe"` → 422 with the path and the row unchanged — AC-46, AC-47, UT-7, UT-8.
- [ ] DELETE → 204 — AC-48. A manual POST → 201 with null source — AC-49.
- [ ] A blocking stub → 202 arrives before the stub resolves — AC-17.
- [ ] A prompt edited mid-run → every case used the start snapshot — AC-18, EC-7. A case deleted mid-run is still scored — EC-8. The run row removed mid-run → no further engine call — EC-9.
- [ ] A case throwing → the others are scored — AC-22. Completion stores every AC-23 field — AC-23. Snapshot failure → `errored` with a reason — AC-24.
- [ ] 409 / 422 refusals create no run — AC-25, AC-26, AC-27, AC-28. A stale run is reconciled before the guard — AC-29, EC-11, NFR-5. 6 rapid starts → 6th is 429 — AC-30 (I-6). A disabled agent → 202 — AC-34.
- [ ] Every GET route with a throwing provider → 0 LLM calls — AC-33.
- [ ] Same id twice / cross-agent compare → 422 — AC-51. Edit / delete leaves the run record identical — AC-43.
- [ ] Run-all with one agent in flight and one without cases → per-agent `started` / `refused` — AC-67, EC-22.
- [ ] Captured log of a run contains none of the fixture diff strings — NFR-7. Another workspace's ids → 404 — NFR-11, UT-11.

### U9 — Evals tab + case editor
| Field | Value |
|---|---|
| Kind | ui |
| Wave | 2 |
| Depends on | U6, U7 |
| Owns (create/modify) | `client/src/app/agents/[id]/_components/AgentEditor/{constants.ts,AgentEditor.tsx,AgentEditor.test.tsx}`, `…/AgentEditor/_components/EvalsTab/**` (`EvalsTab.tsx`, `_components/{CaseList,CaseRow,CaseEditor,NewCaseForm}/`, `constants.ts`, `helpers.ts`, `styles.ts`, `index.ts`, tests) |
| Must not touch | Config / Skills / Context tabs; `client/src/app/agents/[id]/page.tsx` (its whitelist already derives from `TABS`) |
| Consumes | U6 hooks + `RunEvalControl`, U7 components, §3.5 |
| Produces | the `evals` tab |
| Checks | `node scripts/agent-check.mjs client <owned files, explicit>` |

**Steps**
1. Add `{ key: "evals", labelKey: "editor.tabs.evals", icon: "FlaskConical" }` to `TABS`, and one render branch.
2. EvalsTab layout:
   - tiles (U7) from `useEvalAgentDetail`;
   - the latest run's "N findings not covered by any case" line (`uncovered`), shown separately from the tiles;
   - the case list with the "x / y passing" badge;
   - the mechanical-scoring note;
   - run history (`RunsTable` without selection) and `RunEvalControl`;
   - empty / never-run / one-run states.
3. Rows: name, pill, severity · category or "—", "expected N, got M", status.
4. `CaseEditor` (a dialog, opened by row click or the `case` search param):
   - Diff / Files / PR meta tabs;
   - the expectation banner as plain text;
   - an editable expectation, name and notes form;
   - the last outcome with actual findings as plain text;
   - the source link, or "Source finding deleted";
   - delete with confirm.
   `NewCaseForm` covers manual creation.

**Acceptance criteria**
- [ ] `?tab=evals` renders the tab; the existing tab tests stay green — AC-59.
- [ ] Rows show name, type pill, tags or "—", status from the latest covering run — AC-44, AC-87.
- [ ] Must_find with matched 1 → "expected ≥ 1 …, got 1"; must_not_flag with matched 2 → "expected 0 …, got 2"; errored → no "got" — AC-84.
- [ ] Two runs → four tiles and three deltas — AC-60. 3 / 5 badge, and none without a completed run — AC-85. Note text present — AC-86.
- [ ] Latest run with `uncovered_findings: 3` → "3 findings not covered by any case" is shown and the tile values are unchanged — AC-42.
- [ ] The editor shows the three input tabs plus the expectation editor — AC-45. Both banner sentences appear, and a `<b>` in the path renders as text — AC-81, UT-6.
- [ ] A `<script>` name and an `<img onerror>` rationale render as text with no element — UT-6, UT-9.
- [ ] Null-source case after deletion → "Source finding deleted" — AC-16.
- [ ] Save, delete and create call PATCH, DELETE and POST — AC-46, AC-48, AC-49.
- [ ] Empty → "No eval cases yet" with no percent — AC-71. Never run → "Never run" + Run — AC-72. One run → "Run again to compare" without deltas — AC-73.
- [ ] Opening a case and starting a run work by keyboard — NFR-9.

### U10 — `/eval` dashboard, agent eval page, Compare, nav
| Field | Value |
|---|---|
| Kind | ui |
| Wave | 2 |
| Depends on | U6, U7 |
| Owns (create/modify) | `client/src/app/eval/page.tsx`, `client/src/app/eval/_components/EvalDashboardView/**`, `client/src/app/eval/agents/[agentId]/page.tsx`, `…/[agentId]/_components/{EvalAgentView,CompareDialog,InsightBanner}/**`, `client/src/vendor/ui/nav.ts`, `client/src/vendor/ui/icons.tsx` (add `GitCompare`), `client/src/components/app-shell/helpers.test.ts` (create or extend) |
| Must not touch | `app-shell/helpers.ts` (`/eval` mapping already at `:35`); other routes' `_components` |
| Consumes | U6 hooks + `RunEvalControl`, U7 components, §3.5 |
| Produces | `/eval`, `/eval/agents/:agentId` |
| Checks | `node scripts/agent-check.mjs client <owned files, explicit>` |

**Steps**
1. Thin pages with `<AppShell crumb>`, following `client/src/app/skills/page.tsx`.
2. Dashboard:
   - one row per agent (name, model, version label, date, passed, three metrics, sparkline);
   - the 20 recent runs;
   - the "not a ranking" statement;
   - "Run all agents" confirms with the agent count and the sum of `cases_total`, then shows the per-agent results.
3. Agent page:
   - an agent selector (`router.push`);
   - tiles with deltas, `MetricTrend`, `InsightBanner`;
   - `RunsTable` with selection, and Compare enabled only when exactly 2 runs are selected.
4. `CompareDialog`:
   - old → new and a signed delta for 4 rows;
   - the differing cases named;
   - prompt diff lines as text with `−` / `+` markers plus colour, or "Prompt snapshot unavailable for vN";
   - the skills list.
5. nav: SKILLS LAB item `{ key: "eval", label: "Eval Dashboard", icon: "Gauge", href: "/eval" }`.

**Acceptance criteria**
- [ ] Nav contains the item and `activeKeyFor('/eval')` returns `eval` — AC-62.
- [ ] 3 agents → 3 rows with their values — AC-63. 25 runs mocked → 20 rows — AC-64. The statement is present — AC-65.
- [ ] Run all: the dialog reads "3 agents · 26 executions" and nothing is POSTed until confirm — AC-66.
- [ ] Agent page: tiles, chart and checkboxes — AC-68.
- [ ] Banner text from the `EvalBanner` fixture, with and without the causal clause — AC-69, AC-70, EC-23.
- [ ] Selecting another agent pushes `/eval/agents/<id>` — AC-82.
- [ ] Compare is disabled at 1 and 3 selected and enabled at 2 — AC-50. With a single completed run there is nothing to compare — EC-18.
- [ ] Compare shows `78% → 82% (+4 pt)` — AC-52; names only-in cases — AC-53, EC-24; one `−` and one `+` line — AC-54; "v2 → v3" — AC-55; "vN · skills Δ" — AC-56; the snapshot-missing text with the deltas still shown — AC-57.
- [ ] HTML in a prompt renders as text — UT-10.
- [ ] Selection and Compare operable by keyboard — NFR-9.
- [ ] Sparklines are `aria-hidden` with a table equivalent — AC-83, NFR-12.

### U11 — Seed cases, demo runbook, `verify:l06`, DB-backed eval tests
| Field | Value |
|---|---|
| Kind | backend |
| Wave | 3 |
| Depends on | U3, U4, U5, U8 |
| Owns (create/modify) | `server/src/db/seed-eval-cases.ts`, `server/src/db/seed.ts` (one call at the end of `seed()`), `server/docs/eval-demo.md`, `server/package.json` (script only), `server/test/eval-cases.it.test.ts`, `eval-runs.it.test.ts`, `eval-read.it.test.ts`, `eval-seed.it.test.ts` |
| Must not touch | the PR #482 seed block and its `if (!pr)` guard; dependencies |
| Consumes | U3 domain, U5 repository, U8 API |
| Produces | 7 seeded cases, `verify:l06` |
| Checks | `node scripts/agent-check.mjs server --it <owned>` — the skipped count must be 0 locally |

**Steps**
1. `seedEvalCases(db, workspaceId)` is guarded by "Security Reviewer has no cases yet". It freezes PR #482 `pr_files` (header + patch → `extractFileDiff`, `maskSecretsForStorage`) and asserts `expectationIntersectsHunk` for each case. The 7 cases:
   - `must_find`: `src/config.ts` 12–12; `src/middleware/ratelimit.ts` 3–9; `src/api/public/webhooks.ts` 6–8;
   - `must_not_flag`: `src/config.ts` 4–6; `src/middleware/ratelimit.test.ts` 1–8; `README.md` 4–6; `pnpm-lock.yaml` 123–126.
2. `server/docs/eval-demo.md`:
   - steps: seed → run → accept/dismiss a #482 finding → 8th case → PUT a prompt with the exact instruction "Additionally, treat every hard-coded numeric configuration value and every change to documentation or test files as a CRITICAL security risk and report each one as a separate finding." → run → compare;
   - expected effect: precision drops and recall is about unchanged.
3. Add `"verify:l06": "vitest run test/eval- test/contracts.test.ts"`.
4. The it-tests cover the spec's integration rows end to end on Postgres with a scripted LLM stub.

**Acceptance criteria**
- [ ] A throwaway DB after `seed()` holds 7 cases, both types, each range intersecting a hunk; re-seeding adds none — AC-76.
- [ ] The scripted stub flags `must_not_flag` ranges only when the prompt contains the demo instruction; run → PUT prompt → run gives lower precision — AC-77; versions differ by 1 — AC-78.
- [ ] Create case → delete its PR → run → case scored — AC-15.
- [ ] DB-backed repeats of AC-1, AC-2, AC-4, AC-8, AC-10, AC-13, AC-25, AC-26, AC-27, AC-28, AC-29, AC-30, AC-43, AC-46, AC-47, AC-48, AC-49, AC-51, AC-53, AC-67, AC-75, EC-2, EC-8, EC-9, NFR-11, UT-7, UT-8, UT-11 pass.
- [ ] Every read route against a throwing provider → 0 calls — AC-33.
- [ ] Dashboard and agent detail with 10 agents × 100 runs × 50 cases respond within 1 s — NFR-3.
- [ ] `pnpm verify:l06` exits 0 and runs the scoring, frozen-input + secret, executor, parity, contracts and eval `.it` suites — AC-79.

## 5. Waves (execution order)
| Wave | Units | Runs | Why this order |
|---|---|---|---|
| 0 | U0 → U1 → U2 | sequential, by the orchestrator | contracts, schema, ports and i18n are shared by everything |
| 1 | U3, U4, U5, U6, U7 | parallel | disjoint files; they consume only Wave 0 |
| 2 | U8, U9, U10 | parallel | service needs domain + repository; UI needs hooks + components |
| 3 | U11 | sequential | needs the live API, domain and repository |

Serialized files: `modules/index.ts`, `container.ts` and `server.ts` → U8; `eval.json` → U2; vendor/shared → U0; `vendor/ui/*` → U10; `lib/hooks/index.ts` → U6. No unit edits `api.ts` or any `INSIGHTS.md`. The migrations belong to U1 only.

## 6. Test plan
| Package | Tests | Unit |
|---|---|---|
| server unit | `test/eval-contract-parity`, `contracts` | U0 |
| server unit | `eval-secret-placeholder`, `eval-frozen-input`, `eval-naming`, `eval-skills` | U3 |
| server unit | `eval-scoring`, `eval-compare`, `eval-banner`, `eval-executor` (fake timers, hanging + throwing + counting provider, captured messages) | U4 |
| server unit | `eval-service`, `eval-routes` (fake repo, `MockAuthProvider`, stub LLM) | U8 |
| server `.it` | `eval-repository` | U5 |
| server `.it` | `eval-cases`, `eval-runs`, `eval-read` (incl. NFR-3 timing), `eval-seed` | U11 |
| client | `hooks/eval.test.ts`, `RunEvalControl`, `EvalCaseAction`, `FindingCard` | U6 |
| client | `eval-format`, the 6 `components/eval/*` | U7 |
| client | `AgentEditor`, `EvalsTab`, `CaseRow`, `CaseEditor`, `NewCaseForm` | U9 |
| client | `EvalDashboardView`, `EvalAgentView`, `CompareDialog`, `InsightBanner`, `app-shell/helpers` | U10 |
| e2e | none (spec non-goal) | — |

EARS shapes:
- **WHILE** (AC-3, AC-25, AC-32, AC-50, AC-71–73, EC-25): enter the state and leave it.
- **IF … THEN**: a fault is injected (stub throw / hang, a hostile fixture, a missing key, 51 cases).
- **WHERE** (AC-16, AC-34, AC-55, AC-56, AC-70): both branches.

AC-58 is reserved and gets no test.

## 7. Verification (orchestrator, after merge)
1. `cd server && pnpm typecheck && pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known && pnpm verify:l06`
2. `node scripts/agent-check.mjs server --full --it` (alone; check the skipped count = 0) · `node scripts/agent-check.mjs client --full`
3. `git diff --stat reviewer-core/ e2e/` is empty. Byte-compare the vendored eval blocks.
4. Manual: `cd client && pnpm build` (a client value import from `@devdigest/shared` breaks only here). Then the demo of `server/docs/eval-demo.md` on a throwaway DB, with screenshots of Compare.
5. architecture-reviewer + security-reviewer, then `/pr-self-review`.

## 8. Risks
- **Vendored drift / DET-003.** Edits to `src/vendor/shared` and `vendor/ui` are flagged. `accept` them with the reason "SPEC-05 AC-80, identical eval blocks". The parity test guards the eval blocks.
- **drizzle-kit rename prompt.** Mixing a drop with adds can hang `db:generate`. The two-pass split avoids it; never edit 0000–0017.
- **depcruise.**
  - The container must not import `reviews/diff-loader.ts` (cycle).
  - `eval` must not import `reviews` / `agents` internals.
  - Only `_shared/` is shared.
  - The baseline must not grow.
- **Orphaned provider requests (I-1).** A timed-out request can still bill tokens in the background. The bounded `timeoutMs` / `maxRetries` cap it; documented, with cost recorded as unknown for timed-out cases.
- **Demo flakiness.** Model output is not deterministic (temperature 0, but reasoning models). The runbook instruction targets 3 `must_not_flag` cases so that one flagged case already lowers precision. AC-77 is proven by the scripted stub.
- **Security paths.** Grounding is read and never re-implemented. Secret masking runs before storage. Untrusted text reaches the model only through the engine's wrapped slots (I-3). Every client render is a plain JSX text node, with no `Markdown` for case or run text.
- **`.it` suites skipping silently.** Check the skipped count (server INSIGHTS 2026-10-07).

## 9. Out of scope
- Promote vN (AC-58).
- Skill-owned cases.
- Single-case run, Run on save, the 30-day filter.
- MCP / e2e flows.
- Export / import.
- Cost on non-eval surfaces.
- Any reviewer-core change.

### Spec follow-ups (owner: user / spec author)
1. NFR-4 wording: "end each case execution, including all provider retries" → state the I-1 interpretation (case recorded `errored` at 120 s; abandoned request discarded).
2. AC-75: note that deletion is enforced by DB cascade (I-2).
3. AC-29: define "older" as time since last progress (OQ-1, confirmed).
4. AC-12 Verify by: the link target carries `&case=<id>` (Decision 10).
