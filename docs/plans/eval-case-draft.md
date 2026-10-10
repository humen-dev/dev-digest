# Eval case draft + Run case (SPEC-06 delta) — development plan

| Field | Value |
|---|---|
| Status | draft |
| Goal | "Turn into eval case" opens a pre-filled, unsaved draft; the user warms it up with a synchronous Run case (nothing stored), edits, and only then saves or cancels (SPEC-06 G-1, US-13). |
| Requirements source | [`specs/eval-pipeline.md`](../../specs/eval-pipeline.md) (SPEC-06, approved, supersedes SPEC-05). Delta only: AC-1, AC-2, AC-4–AC-9, AC-11–AC-14a, AC-33, AC-45, AC-46, AC-49, EC-4, AC-88–AC-110, EC-26–EC-32, NFR-14–NFR-16, UT-12–UT-15. Everything else stays as built by [`eval-pipeline.md`](./eval-pipeline.md). |
| Execution mode | multi-agent (parallel waves) — the user's standing choice. Server ∥ client is real parallelism; 3 implementer units after a Wave 0. |
| Packages touched | server · client · shared (vendored, both copies) |

## 1. Context
- **Base plan.** SPEC-05 is fully implemented per [`eval-pipeline.md`](./eval-pipeline.md). Its §3 contracts, §1 interpretations I-1 to I-8 and Decisions still hold unless this plan says otherwise.
- **Server today.**
  - `POST /findings/:id/eval-case` stores a case immediately (`server/src/modules/eval/routes.ts:33-41` → `EvalService.createFromFinding`, `server/src/modules/eval/service.ts:119-161`).
  - The executor runs one case (`server/src/modules/eval/executor.ts:75-124`). It takes a full `EvalCase` (`:21`) but only reads `input_diff` and `input_meta` (`:88-91`).
  - Masking: `maskSecretsForStorage` (`service.ts:20`). Size and hunk checks: `validateFrozen` (`service.ts:540-559`).
  - Per-case reason codes: `server/src/modules/eval/constants.ts:17-22`. Error codes: `server/src/modules/eval/types.ts:11-22`.
  - Suite-start rate limit is per route (`constants.ts:24-25`).
  - Fastify sets `bodyLimit` to 1 MB (`server/src/app.ts:49`) and configures no request timeout (`app.ts:46-49`).
- **Client today.**
  - `EvalCaseAction` POSTs on click and shows a link (`client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/_components/EvalCaseAction/EvalCaseAction.tsx:15-56`; hook `useCreateEvalCaseFromFinding`, `client/src/lib/hooks/eval.ts:64-74`).
  - The case form lives under the agents route:
    - `CaseFormFields` (`client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/_components/CaseFormFields/CaseFormFields.tsx:15-113`);
    - draft helpers (`…/EvalsTab/helpers.ts:11-112`);
    - `CaseDraft` (`…/EvalsTab/types.ts:4-14`);
    - `useDialogKeyboard` (`…/EvalsTab/hooks/useDialogKeyboard.ts:10-33`).
  - `CaseEditorView` renders `outcome.error_reason` raw (`…/CaseEditor/CaseEditorView.tsx:112`).
  - `api.ts` sets no fetch timeout (`client/src/lib/api.ts:21-33`).
- **Constraints.**
  - frontend-ui-architecture rule 2: a route never imports another route's `_components`. The draft modal opens on the PR page and in the Evals tab, so it must move to `client/src/components/eval/` (Decision 3).
  - client INSIGHTS 2026-09-29: use `fireEvent`, there is no user-event.
  - client INSIGHTS 2026-10-07: assert polling and pending queries via the query cache.
  - server INSIGHTS 2026-10-07: DET-006 fixtures are built at runtime.

### Requirements review
- **Verdict:** approved spec; nothing blocking. Feasibility checked against the code above. Q-7 and Q-8 are taken with their defaults (coordinator, 2026-10-10). Q-9 is decided in §3.3.
- **F1 (minor).** AC-104 asks for a per-case reason on suite case rows too. Today only the case editor shows a reason, and it shows it raw (`CaseEditorView.tsx:112`). Planned: map the reason there (U4). The case rows show no reason today, and none is added.
- **F2 (minor).** NFR-14 "neither side aborts before 125 s":
  - Client: `api.ts` has no timeout and stays as it is.
  - API: Fastify v5 defaults `requestTimeout` / `connectionTimeout` to 0. Verified by a test that reads `app.initialConfig`, plus an `app.inject` run with a 110 s stub under fake timers.
- **Recommendations:** none new. The base plan's R1–R6 still apply.

### Decisions
1. **Routes (Q-9, R1 style):**
   - `GET /findings/:id/eval-case-draft` — read-only, 0 LLM calls;
   - `POST /findings/:id/eval-case` — now *save the edited draft*, body `EvalCaseInput`;
   - `POST /agents/:id/eval-cases/run` — Run case.

   Rejected: `POST …/draft`. A draft has no side effects, so GET fits it (and AC-33).
2. **Run case in-flight guard (AC-96)** is a process-local `Set` of `workspaceId:agentId` in `EvalService`. It is released in `finally` and is independent of the suite-run guard (AC-99). Rejected: a DB flag — the spec says no new table or column. The single-process local app makes in-memory safe; recorded in §8.
3. **The shared modal is promoted** to `client/src/components/eval/CaseModal/`. It has two consumers on two routes (rule 1 + rule 2). `CaseFormFields`, the draft helpers and `useDialogKeyboard` move with it, and the Evals tab keeps thin wrappers. Rejected: leaving the modal under `agents/[id]` and importing it from the PR route (a rule 2 violation).
4. **Masked text returned to the client (EC-32).** The Run case response carries the masked `input_diff` / `pr_title` / `pr_body`. The modal replaces its form values with them, and the freshness key is computed over the masked values.
5. **The save body reuses `EvalCaseInput`.** Its `expectation.type` is the draft's type. The server re-derives the type from the current decision; a mismatch gives 409 `decision_changed` (AC-93, Q-7). `pr_id` / `pr_number` / `severity` / `category` / owner come from the finding, never from the body.
6. **Run case uses the agent's current configuration** (current version and prompt skills), resolved per request. It reuses the start-of-run resolution of `startRun` through one private helper (AC-94).

### Open questions
none

## 2. Affected modules
| Package | Touched? | Why / what changes | Architecture rule that applies |
|---|---|---|---|
| server | yes | `modules/eval/{service,routes,executor,constants,types}.ts` + tests | onion: routes thin, service owns rules, no repo writes on draft or Run case; depcruise baseline unchanged |
| client | yes | `lib/hooks/eval.ts`, `lib/eval-format.ts`, new `components/eval/CaseModal/`, `EvalCaseAction`, EvalsTab wrappers | frontend-ui-architecture rules 1, 2, 5, 6 (promotion, one-way deps, hooks for data) |
| reviewer-core | no | consumed only | grounding gate / `INJECTION_GUARD` untouched |
| e2e | no | spec non-goal | — |
| shared (vendored) | yes | three schemas appended inside the eval region of `eval-ci.ts`, identical in both copies | parity test (AC-80); DET-003 accept |

## 3. Contracts

### 3.1 Vendored `eval-ci.ts` (both copies, inside the `// Eval — case input` … `// Compose Review` region; import `EvalActualFinding` from `./knowledge.js`)
```ts
/** A draft built from a triaged finding (SPEC-06 AC-1, AC-5–AC-7, AC-11). Never stored. */
export const EvalCaseDraft = z.object({
  agent_id: z.string(), agent_name: z.string(), source_finding_id: z.string(),
  name: z.string(), input_diff: z.string(), input_files: z.array(z.string()),
  input_meta: EvalCaseMeta, expectation: EvalExpectation,
  severity: z.string().nullable(), category: z.string().nullable(),
});
export type EvalCaseDraft = z.infer<typeof EvalCaseDraft>;
/** GET /findings/:id/eval-case-draft — a draft, or the finding's existing case (AC-2). */
export const EvalCaseDraftResponse = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('draft'), draft: EvalCaseDraft }),
  z.object({ kind: z.literal('existing_case'), case_id: z.string(), owner_id: z.string() }),
]);
export type EvalCaseDraftResponse = z.infer<typeof EvalCaseDraftResponse>;
/** POST /agents/:id/eval-cases/run — the modal's current values (AC-94, AC-108). */
export const EvalCaseRunInput = z.object({ input_diff: z.string().min(1), pr_title: z.string(),
  pr_body: z.string().nullable(), expectation: EvalExpectation }).strict();
export type EvalCaseRunInput = z.infer<typeof EvalCaseRunInput>;
/** Dry-run result; nothing is stored (AC-95). `masked` is what was sent to the model (EC-32). */
export const EvalCaseRunResult = z.object({
  status: z.enum(['scored', 'errored']), pass: z.boolean().nullable(), error_reason: z.string().nullable(),
  findings_total: z.number().int(), findings_matched: z.number().int(), actual: z.array(EvalActualFinding),
  duration_ms: z.number().int(), cost_usd: z.number().nullable(), agent_version: z.number().int(),
  masked: z.object({ input_diff: z.string(), pr_title: z.string(), pr_body: z.string().nullable() }),
});
export type EvalCaseRunResult = z.infer<typeof EvalCaseRunResult>;
```
Unchanged and reused: `EvalCaseInput` is the save body for `POST /findings/:id/eval-case`.

### 3.2 Server internals
- `constants.ts`: add `EVAL_CASE_RUN_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const` (its own per-route bucket, AC-97).
- `types.ts`: add `decision_changed` and `case_run_in_flight` to `EVAL_ERROR_CODES`.
- `executor.ts`: `RunCaseInput.evalCase` widens to `Pick<EvalCase, 'input_diff' | 'input_meta'>`. Behaviour is unchanged.
- `EvalService` replaces `createFromFinding` with:
  - `draftFromFinding(ws, findingId): Promise<EvalCaseDraftResponse>`;
  - `saveFromFinding(ws, findingId, body: EvalCaseInput): Promise<{ case: EvalCase; created: boolean }>`.

  It adds `runCaseDry(ws, agentId, input: EvalCaseRunInput, log): Promise<EvalCaseRunResult>`.

### 3.3 HTTP (delta)
| Method · path | Body → response | Errors |
|---|---|---|
| GET `/findings/:id/eval-case-draft` | → 200 `EvalCaseDraftResponse` | 404 · 422 `finding_not_triaged` / `agent_unavailable` / `diff_unavailable` / `expectation_outside_diff` / `frozen_input_too_large` |
| POST `/findings/:id/eval-case` (changed) | `EvalCaseInput` → 201 / 200 `EvalCase` | 404 (EC-29) · 409 `decision_changed` · 422 `finding_not_triaged` / `agent_unavailable` / `expectation_outside_diff` / `frozen_input_too_large` / field path |
| POST `/agents/:id/eval-cases/run` | `EvalCaseRunInput` → 200 `EvalCaseRunResult` | 404 (agent, EC-31) · 409 `case_run_in_flight` · 413 (> 1 MB) · 422 `provider_key_missing` / `frozen_input_too_large` / `expectation_outside_diff` / field path · 429 |

### 3.4 i18n `client/messages/en/eval.json` (add only; exact English copy from the spec quotes)
- **Modal** (`caseModal.*`):
  - titles: `draftTitle`, `newTitle`;
  - Run case: `runCase`, `running`, `saveGate` (AC-100), `stale` (AC-101);
  - discard (AC-105): `discardConfirm`, `discard`, `keepEditing`;
  - result banner (AC-102): `resultPassed`, `resultFailed`, `resultExpected` (`{expected}`, `{file}`, `{start}`, `{end}`, `{got}`), `resultMeta` (`{duration}`, `{cost}`);
  - findings list (AC-103): `findingsHeading`, `matched`;
  - `typeFromDecision` (AC-90).
- **Reasons** (AC-104): `reason.{timeout,provider_error,invalid_output,error}`.
- **Errors:** `errors.{decision_changed,case_run_in_flight}`.

## 4. Work units
Checks follow the base plan (`node scripts/agent-check.mjs <pkg> <files>`; server units also run depcruise with `--ignore-known`).

### U0 — Vendored contracts (Wave 0, orchestrator)
| Field | Value |
|---|---|
| Kind | backend |
| Wave | 0 |
| Depends on | none |
| Owns (create/modify) | `server/src/vendor/shared/contracts/eval-ci.ts`, `client/src/vendor/shared/contracts/eval-ci.ts`, `server/test/eval-contract-parity.test.ts` |
| Must not touch | any block outside the eval region; `knowledge.ts` |
| Consumes | — |
| Produces | §3.1 |
| Checks | `node scripts/agent-check.mjs server server/test/eval-contract-parity.test.ts` · `cd client && pnpm typecheck` |

**Steps:**
1. Append §3.1 byte-identically to both copies.
2. Add parse assertions to the parity test.

**Acceptance criteria**
- [ ] The parity test passes with the new schemas inside the region — SPEC-06 AC-80.
- [ ] `EvalCaseRunInput` rejects an unknown key and a bad expectation with the field path — UT-7, AC-47.
- [ ] `EvalCaseDraftResponse` parses both `kind` variants — AC-1, AC-2.

### U1 — i18n keys (Wave 0, orchestrator)
| Field | Value |
|---|---|
| Kind | ui |
| Wave | 0 |
| Depends on | none |
| Owns (create/modify) | `client/messages/en/eval.json` |
| Must not touch | existing keys' copy |
| Consumes | — |
| Produces | §3.4 |
| Checks | JSON parse · `cd client && pnpm typecheck` |

**Acceptance criteria**
- [ ] Every §3.4 key exists. Reason texts equal the AC-104 quotes; the Save-gate, stale and discard texts equal the AC-100, AC-101 and AC-105 quotes — NFR-10, AC-104.

### U2 — Server: draft, save, Run case
| Field | Value |
|---|---|
| Kind | backend |
| Wave | 1 |
| Depends on | U0 |
| Owns (create/modify) | `server/src/modules/eval/{service,routes,executor,constants,types}.ts`, `server/test/eval-service.test.ts`, `server/test/eval-routes.test.ts`, `server/test/eval-case-run.test.ts` (new), `server/test/eval-cases.it.test.ts`, `server/test/eval-case-draft.it.test.ts` (new) |
| Must not touch | `repository.ts`, `ports.ts`, `domain/**`, `_shared/**`, `reviewer-core/**`, other modules |
| Consumes | §3.1, existing domain + repository port |
| Produces | §3.2, §3.3 |
| Checks | `node scripts/agent-check.mjs server --it <owned>` · depcruise |

**Steps**
1. **Shared builder.** Split `createFromFinding` into a private builder that ends before any insert:
   - find the finding (404);
   - check for an existing case;
   - take the type from the later of the two decisions;
   - check the agent;
   - `fileDiffOf`, mask, `validateFrozen`, `caseNameFromTitle`.
2. **`draftFromFinding`.** Returns `existing_case` if the finding already has a case, otherwise the built draft. It never writes.
3. **`saveFromFinding`**, in this order:
   - 404 when the finding is missing (EC-29);
   - existing case → 200;
   - untriaged → 422;
   - the decision's type ≠ `body.expectation.type` → 409 `decision_changed`;
   - agent null or deleted → 422 `agent_unavailable`;
   - mask the name, notes, diff, title and body (AC-14, AC-14a);
   - `validateFrozen` (AC-8, AC-9);
   - `insertCase` with `source_finding_id`, plus `pr_id` / `pr_number` / `severity` / `category` / owner taken from the finding.
4. **`runCaseDry`**, in this order:
   - `requireAgent` (404);
   - in-flight `Set` check → 409, then mark, released in `finally`;
   - mask the input;
   - `validateFrozen`;
   - resolve the LLM (`ConfigError` → 422 `provider_key_missing`);
   - resolve the current snapshot, prompt skills and blocks (a helper shared with `startRun`);
   - `runCase` once, then `scoreCase` with ref `{ id: 'draft', name, expectation }`, or `erroredOutcome` on `EvalCaseError`;
   - after the run, `agentSnapshot` is null → 404 (EC-31);
   - return the result with `masked` and `agent_version`.

   No repository write anywhere on this path. Log ids, status, duration and cost only (NFR-7).
5. **Routes** per §3.3. Run case carries `config.rateLimit = EVAL_CASE_RUN_RATE_LIMIT`. The old create-from-finding behaviour is removed.

**Acceptance criteria** (unit with fake repo / `app.inject` + `MockAuthProvider` + stub LLM; `.it` on Postgres)
- [ ] Draft:
  - dismissed finding → 200 `draft` with `must_not_flag`, accepted → `must_find`, both with the finding's file and lines, and 0 case rows — AC-1, AC-5, AC-6;
  - the finding already has a case → `existing_case` with its id and owner — AC-2;
  - the draft diff holds only the finding's file — AC-7;
  - out-of-hunk → 422, 201 KB → 422, untriaged → 422, null agent → 422, each with 0 rows and 0 provider calls — AC-4, AC-8, AC-9, AC-13;
  - name slug, `-2` suffix and ≤ 120 chars — AC-11;
  - a runtime-built token and a PEM block are masked in the draft — AC-14, AC-14a;
  - a counting provider sees 0 calls on draft and save — NFR-15, AC-33.
- [ ] Save:
  - an edited draft → 201 storing the edited values and `source_finding_id` — AC-91;
  - two saves → 201 then 200 with one row — AC-92, EC-4, EC-27;
  - accept → draft → dismiss → save → 409, 0 rows — AC-93, EC-28;
  - finding deleted → 404 — EC-29;
  - untriaged → 422 — AC-4;
  - out-of-hunk or oversize → 422 — AC-8, AC-9;
  - secrets masked in the stored row — AC-14, AC-14a.
- [ ] Run case:
  - a stub with one matching finding → 200 `scored`, `pass: true`, matched 1, the finding flagged `matched` — AC-94;
  - `eval_cases` / `eval_runs` counts and the dashboard payload are identical before and after — AC-95;
  - a blocking stub plus a second request → 409 with no second LLM call — AC-96;
  - 11 requests → the 11th returns 429 — AC-97;
  - no key → 422 with 0 calls — AC-98;
  - with a suite run in flight → 200 — AC-99;
  - unsaved edits of a saved case run, and the stored case is unchanged — AC-108;
  - a throwing or hanging (fake-timer 120 s) provider → `errored` with reason `provider_error` / `timeout` — EC-30, AC-22;
  - the agent deleted mid-run → 404 — EC-31.
- [ ] Run case input safety:
  - hostile text only inside the untrusted blocks of the captured messages — UT-12;
  - the captured provider request contains no original secret line, and `masked` holds the placeholder — UT-13, EC-32;
  - a 1.1 MB body → 413 with 0 calls — UT-15;
  - a counting engine stub sees ≤ 1 call per request and 0 for refused ones — NFR-16.
- [ ] NFR-14: a 110 s stub under fake timers → 200 via `app.inject`; `app.initialConfig.requestTimeout` and `connectionTimeout` are 0.
- [ ] Regression: `PATCH /eval-cases/:id` and manual POST still apply AC-8, AC-9, AC-14 and AC-14a — AC-46, AC-49.

### U3 — Client: hooks + shared CaseModal (warm-up)
| Field | Value |
|---|---|
| Kind | ui |
| Wave | 1 |
| Depends on | U0, U1 |
| Owns (create/modify) | `client/src/lib/hooks/eval.ts`, `client/src/lib/hooks/eval.test.ts`, `client/src/lib/eval-format.ts` (+ `.test.ts`), `client/src/components/eval/CaseModal/**` (new: `CaseModal.tsx`, `CaseModal.test.tsx`, `index.ts`, `types.ts`, `helpers.ts`, `helpers.test.ts`, `constants.ts`, `styles.ts`, `useCaseWarmup.ts`, `useDialogKeyboard.ts`, `_components/{CaseFormFields,RunResult}/**`) |
| Must not touch | `client/src/lib/api.ts`; anything under `client/src/app/**` |
| Consumes | §3.1, §3.3, §3.4; `ExpectationPill`, `TruncatedText` |
| Produces | hooks `useEvalCaseDraft` (mutation over GET), `useSaveEvalCaseFromFinding(findingId)`, `useRunEvalCase(agentId)` (no invalidation); `caseReasonKey(code)` in `eval-format.ts`; `<CaseModal mode agentId onSaved onClose footerExtra? bodyExtra? />` (`bodyExtra` added during U3 — the footer is too narrow for the last-outcome block) |
| Checks | `node scripts/agent-check.mjs client <owned files, explicit>` |

**Steps**
1. **Hooks.** `useCreateEvalCaseFromFinding` is replaced by `useSaveEvalCaseFromFinding`, which on success invalidates the same keys as before. `useRunEvalCase` calls `api.post` with no `AbortSignal` / timeout (NFR-14).
2. **Promote the form pieces** into `CaseModal/`. Copy (do not import) `CaseFormFields`, the `CaseDraft` type, the draft helpers and `useDialogKeyboard` from EvalsTab. Add:
   - a `lockedType` prop that shows `ExpectationPill` instead of the type select (AC-90);
   - `contentKey(draft)` over diff, PR title / body, type, file and lines.
3. **`useCaseWarmup`** holds the warm-up state:
   - the draft, the last result and the key it ran on;
   - a request token, so a response that arrives after close or a newer run is dropped (AC-107);
   - on a result, the masked values are applied to the form (EC-32);
   - `canSave(mode)`:
     - finding and manual drafts need a fresh `scored` result;
     - for a saved case, a name / notes-only change saves without a run; otherwise it needs a fresh `scored` result (AC-100, AC-109, Q-8);
   - `dirty` and `ran` flags for the discard prompt.
4. **`CaseModal`** has three modes: `finding` (draft + findingId, locked type), `manual` (empty draft, type select) and `saved` (detail; `footerExtra` slot for delete, `bodyExtra` slot under the form for source link / last outcome). It shows:
   - a Run case button;
   - the `RunResult` banner, plain text: Passed / Failed · "expected ≥ 1 / 0 at file:range, got M" · duration · `formatRunCost`; the errored reason via `caseReasonKey`; a stale grey-out;
   - the findings list as plain text with a "matched" marker;
   - Save disabled with the gate hint until `canSave`.

   Closing (Cancel, Esc via `useDialogKeyboard`, or the Modal's `onClose`) after an edit or a run asks "Discard this draft?" first. Save calls the mode's mutation (`useSaveEvalCaseFromFinding` / `useCreateEvalCase` / `useUpdateEvalCase`), and errors map through `errors.*`.
5. **`caseReasonKey`** maps the 4 known codes to `reason.*`; for any other code it returns null, so the code is rendered raw.

**Acceptance criteria**
- [ ] A `finding` mode modal renders the draft's name, Diff / Files / PR meta and expectation; no save request is made on open — AC-88. It shows a fixed pill and no type select, with file and lines editable — AC-90.
- [ ] Save gate:
  - a new draft has Save disabled with the gate text;
  - a scored run enables it;
  - editing the diff disables it again;
  - an `errored` result keeps it disabled — AC-100, EC-30, Q-8.
- [ ] Run → edit lines → the stale text is shown — AC-101.
- [ ] Mocked pass and fail results render the banner text; a null cost renders "—" — AC-102. Two findings, one matched, are both listed and one is marked — AC-103.
- [ ] Each reason code renders its text, and an unknown code renders the code itself — AC-104.
- [ ] An edited draft + Esc → the confirm is shown; an unedited draft closes at once — AC-105. Cancel sends no POST to the save or create routes — AC-106.
- [ ] Close during a pending run, then resolve it → no banner and no state change — AC-107, EC-26.
- [ ] `saved` mode: a rename only → Save enabled; a line change → disabled until a scored run — AC-109, AC-45.
- [ ] `manual` mode: the type select is present; Save is disabled until a scored run — AC-110.
- [ ] A run whose response carries masked text → the form shows the masked text — EC-32.
- [ ] An `<img onerror>` in a finding title, path or reason renders as text with no element — UT-14.
- [ ] Run case, Save, Cancel and the discard confirm are operable by keyboard — NFR-9.
- [ ] `useRunEvalCase` calls `api.post` without a signal; `useSaveEvalCaseFromFinding` invalidates the agent's cases, detail and dashboard — NFR-14, AC-91.

### U4 — Client: wire the modal into FindingCard and the Evals tab
| Field | Value |
|---|---|
| Kind | ui |
| Wave | 2 |
| Depends on | U3 |
| Owns (create/modify) | `…/FindingCard/_components/EvalCaseAction/{EvalCaseAction.tsx,EvalCaseAction.test.tsx,helpers.ts,constants.ts,styles.ts}`; `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/{EvalsTab.tsx,EvalsTab.test.tsx,helpers.ts,types.ts,constants.ts}`, `…/EvalsTab/_components/{CaseEditor,NewCaseForm}/**`; delete `…/EvalsTab/_components/CaseFormFields/**` and `…/EvalsTab/hooks/useDialogKeyboard.ts` |
| Must not touch | `client/src/components/eval/**`, `client/src/lib/**`, other EvalsTab components (CaseList, CaseRow) |
| Consumes | U3 `CaseModal`, hooks, `caseReasonKey` |
| Produces | the user-visible flow |
| Checks | `node scripts/agent-check.mjs client <owned files, explicit>` |

**Steps**
1. `EvalCaseAction`:
   - a click calls `useEvalCaseDraft`;
   - `existing_case` → `router.push(evalCaseHref(owner_id, case_id))` (AC-89);
   - `draft` → `<CaseModal mode="finding">`;
   - `onSaved` → the "Eval case ✓" link (AC-12);
   - draft errors show `errors.*`;
   - the untriaged disabled state is kept (AC-3).
2. `NewCaseForm` becomes `<CaseModal mode="manual">`. `CaseEditorView` becomes `<CaseModal mode="saved">`, and its delete goes into `footerExtra` and its source link / last outcome into `bodyExtra`; the last-outcome reason goes through `caseReasonKey`.
3. Remove the moved helpers, types and hooks from EvalsTab. Nothing in `app/**` may import them any more.

**Acceptance criteria**
- [ ] A click on a triaged finding with a mocked draft opens the pre-filled modal and issues no save POST — AC-88. A mocked `existing_case` navigates to `/agents/<owner>?tab=evals&case=<id>` — AC-89.
- [ ] A mocked save 201 shows the link `/agents/ag1?tab=evals&case=c1`; a save 200 (second tab) shows the same link — AC-12, EC-27. Untriaged keeps the button disabled with the hint — AC-3.
- [ ] Opening a saved case shows the three input tabs, the expectation editor and Run case — AC-45. Saving a gated edit sends PATCH only after a scored run — AC-46, AC-109.
- [ ] "New eval case" opens the modal with the type select; Save posts to the manual route after a scored run — AC-49, AC-110.
- [ ] A suite case whose last outcome is `timeout` shows "Timed out after 120 s" in the editor — AC-104.
- [ ] Existing EvalsTab and FindingCard tests stay green, except the replaced one-click test (spec Compatibility).
- [ ] `rg "EvalsTab/(helpers|types|hooks/useDialogKeyboard|_components/CaseFormFields)" client/src` finds only EvalsTab-internal uses of the kept helpers (`metricDeltas`).

## 5. Waves (execution order)
| Wave | Units | Runs | Why this order |
|---|---|---|---|
| 0 | U0 → U1 | sequential, by the orchestrator | vendored contract + i18n are shared |
| 1 | U2, U3 | parallel | disjoint packages; both consume only Wave 0 |
| 2 | U4 | sequential | consumes U3's `CaseModal`; it also deletes the duplicates U3 copied |

Between Wave 1 and Wave 2 the form pieces exist twice (EvalsTab and `CaseModal`). This is intended and is removed by U4. Serialized files: `eval.json` → U1; vendor/shared → U0; `lib/hooks/eval.ts` → U3. No migration. No change to `modules/index.ts` or `container.ts`.

## 6. Test plan
| Package | Tests | Unit |
|---|---|---|
| server unit | `eval-contract-parity` (new schemas) | U0 |
| server unit | `eval-service`, `eval-routes`, `eval-case-run` (fake timers, counting / throwing / hanging / blocking stubs, captured messages, 413, 429, NFR-14 config) | U2 |
| server `.it` | `eval-cases` (save path updated), `eval-case-draft` (draft, save, 409, 404, Run case dry-run row counts, AC-99 with a running suite) | U2 |
| client | `hooks/eval.test.ts`, `eval-format.test.ts`, `CaseModal.test.tsx`, `CaseModal/helpers.test.ts` | U3 |
| client | `EvalCaseAction.test.tsx`, `EvalsTab.test.tsx` | U4 |

EARS shapes:
- **WHILE** (AC-90, AC-96, AC-100, AC-109): enter the state and leave it.
- **IF … THEN** (AC-93, AC-97, AC-98, EC-29, EC-31, UT-12, UT-13, UT-15): the fault is injected.
- **WHERE** (AC-99): a suite run present, and absent.

`verify:l06` (`vitest run test/eval- …`) picks the new server files up by name.

## 7. Verification (orchestrator, after merge)
1. `cd server && pnpm typecheck && pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known && pnpm verify:l06`.
2. `node scripts/agent-check.mjs server --full --it` (alone, skipped count 0) · `node scripts/agent-check.mjs client --full` · `cd client && pnpm build`.
3. `git diff --stat reviewer-core/ e2e/ server/src/db/` is empty.
4. Manual demo: open a #482 finding → draft → Run case → edit the range → stale → run → Save → the link opens the case. Re-run the base runbook `server/docs/eval-demo.md`.
5. architecture-reviewer + security-reviewer, then `/pr-self-review`.

## 8. Risks
- **Process-local in-flight guard (Decision 2).** It does not hold across several API processes. The app is single-process locally; recorded in the code comment.
- **Cost of abandoned runs.** Closing the modal does not cancel the server work (EC-26, I-1). The 10/min bucket and the per-agent guard cap it.
- **Breaking route change.** `POST /findings/:id/eval-case` now requires a body; the only caller changes in U4. Between waves the old client breaks against the new server. This is acceptable on a feature branch; do not ship Wave 1 alone.
- **Duplicate form code between waves (§5).** If U4 is skipped, plan-verifier must flag it.
- **Vendored edit (DET-003).** `accept` with "SPEC-06 AC-80". Masking must stay before the LLM call on the Run case path (UT-13): the security reviewer should trace `runCaseDry`.

## 9. Out of scope
Everything the base plan lists as out of scope, plus:
- persisting Run case results;
- cancelling a server-side Run case on close;
- Run on save;
- extending the secret patterns (spec Q-6).

### Spec follow-ups (owner: user / spec author)
none
