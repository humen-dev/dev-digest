# Conventions Extractor — implementation plan

## Context

DevDigest's Skills Lab has Skills + Agents, but the **Conventions** step of homework L02 is
missing: scan a cloned repo for the house rules it already follows, let a maintainer
accept / reject / edit each candidate, and merge the accepted ones into a skill linked to a
reviewing agent (design: 2 screenshots — Conventions board + "Create skill from conventions"
modal; grading criteria 38–53, plus 6/44 for the sidebar).

The starter left scaffolding but no module/UI: `conventions` table (`server/src/db/schema/knowledge.ts:31`),
`ConventionCandidate` contract (both vendored `contracts/knowledge.ts:179`),
`repoIntel.getConventionSamples()` (`server/src/modules/repo-intel/service.ts:630`, no callers),
`FEATURE_MODELS.conventions` + Settings → Models row (UI already exists,
`client/src/app/settings/[section]/_components/SettingsView/_components/SettingsModels/SettingsModels.tsx`),
mock seam `MockLLMProvider.structuredBySchema['ConventionExtraction']` (`server/src/adapters/mocks.ts:48`),
orphan i18n `client/messages/en/conventions.json`, nav key mapping (`client/src/components/app-shell/helpers.ts:31`).

A reference implementation exists in git (`641b637`, reverted by `c6af1e4`). **Decision: our own
implementation** fitted to the current onion architecture + our Skills module; the reference is
used only for lessons (schema field order, code evidence gate, replace-only-pending).

Design premise: **the model only proposes; code chooses what it reads and code verifies what it claims.**

### Decisions agreed with the user
- Own implementation, not a port of `641b637`.
- Implement 3 quality upgrades: **frequency via ripgrep**, **diverse sample incl. tests**, **learn from rejections**; every other idea → Roadmap in the spec.
- **Selected (accepted) candidates → ONE skill** per Create; repeat with another selection for more skills.
- Default skill name **`<repo>-conventions`** (e.g. `payments-api-conventions`), editable.
- **No agent linking in the create flow.** The modal only creates the skill; linking happens through the
  existing mechanism — `/agents/:id` → Skills tab → enable the new skill (criteria 13/37, already built).
  Criterion 42 ("linked to an agent") is satisfied and verified via that tab + the run trace's skills block.

## Branch & deliverables
- New branch `feature-L02-conventions` off `docs/agents-md-rename` (Skills module lives there, not on `main`). Don't commit the untracked `.claude/launch.json`.
- **Spec** (English, repo convention): `server/specs/conventions.md`, `client/specs/conventions.md` + rows in both `specs/README.md` indexes and `client/specs/pages.md`. Spec includes the Roadmap.
- **Plan** copied into the repo as `docs/plans/conventions-extractor.md` (this file, trimmed).
- Spec + plan are committed FIRST (step 0), then implementation.

## Data model (server/src/db/schema/knowledge.ts)
- Extend `conventions`: `category` text enum NOT NULL default `'other'`, `rationale` text null,
  `evidence_line` int, `occurrences` int null (distinct files; null = not measured),
  `status` text enum `pending|accepted|rejected` NOT NULL default `pending`, `created_at`;
  index `(repo_id, status)`.
- New `convention_scans`: id, workspace_id, repo_id (FK cascade), `sampled_files` jsonb string[],
  `proposed`, `dropped_ungrounded`, `dropped_duplicate`, `dropped_rare`, `kept` (int),
  `model`, `api_cost_usd` (real cost only, null otherwise), `head_sha`, `duration_ms`, `created_at`;
  index `(repo_id, created_at)`. Powers "Detected from N sample files · last scan 1h ago" across reloads.
- **Two generated migrations** (drizzle-kit would otherwise prompt rename-vs-create):
  1. `pnpm db:generate --name conventions_triage` (+ hand-appended `UPDATE conventions SET status='accepted' WHERE accepted;` before first apply);
  2. drop `accepted` → `pnpm db:generate --name conventions_drop_accepted`. Append-only, numbers 0012/0013.
- Text enums without CHECK (repo convention; zod validates at the edge).

## Contracts (edit the Conventions block byte-identically in BOTH `server/src/vendor/shared/contracts/knowledge.ts` and `client/src/vendor/shared/contracts/knowledge.ts`)
`ConventionCategory` (naming, structure, imports, error_handling, typing, testing, api, data_access, style, other),
`ConventionStatus`, `ConventionCandidate` {id, repo_id, rule, rationale|null, category, evidence_path,
evidence_line, evidence_snippet, occurrences|null, confidence 0..1, status, created_at} (drop `accepted`),
`ConventionScan`, `ConventionBoard {candidates, last_scan|null}`, `ConventionSkillDraft`
{name, description, type, enabled, body, body_tokens, evidence_files, convention_ids}.
Also change `FEATURE_MODELS.conventions` default to a cheap model: `openrouter` / `deepseek/deepseek-v4-flash`
in both `contracts/platform.ts` copies + `client/src/lib/feature-models.ts` (the Settings UI only stores openrouter choices anyway).

## Server — `server/src/modules/conventions/` (layout copies `modules/skills/`)

| File | Responsibility |
|---|---|
| `constants.ts` | `CONFIG_SAMPLE_PATHS` (package.json, tsconfig.json, eslint/prettier/editorconfig/biome, AGENTS/CLAUDE/CONTRIBUTING.md), `TOP_SAMPLES=12`, `DIVERSITY_EXTRA=6`, per-file/total char budgets, `MIN_SNIPPET_CHARS=8`, `DEDUPE_JACCARD=0.6`, grep timeouts/concurrency/caps, `MAX_DECIDED_IN_PROMPT=40` |
| `types.ts` | zod bodies: `PatchConventionBody {status?, rule?, rationale?, category?}` (≥1 field), `BulkStatusBody {ids, status}`, `SkillDraftBody {ids?}`, `CreateSkillFromConventionsBody {name, description, type, enabled, body, convention_ids}`; internal `SampledFile`, `ScanCounters` |
| `domain/sampling.ts` | `classifyPath` → test/route/service/data/ui/hook/util/other; `isSafeRelativePath` (no abs, drive letter, `..`, NUL); `pickDiversityExtras(ranked, alreadyChosen, n)` — round-robin over buckets NOT covered by the top-12, **tests included**; `truncateForSample` |
| `domain/render.ts` | 1-based line-number gutter; each file wrapped with `wrapUntrusted` (from `@devdigest/reviewer-core`) |
| `domain/prompt.ts` | `ConventionExtraction` zod schema — **field order load-bearing**: `rule, rationale, evidence_path, evidence_line, evidence_snippet, grep_literal, category, confidence` (nullable, no array/number bounds — clamp in code); system prompt (what a house rule is, anti-patterns, category defs, confidence bands, ≤12, "ungrounded = discarded"); `buildMessages(samples, decided)` — accepted + **rejected rules passed as "already decided by the maintainer, do not re-propose"** |
| `domain/evidence-gate.ts` | `resolveEvidencePath` (normalize `\`→`/`, exact or UNIQUE suffix match against sampled set only), `stripGutter`, `locateSnippet` (whitespace-insensitive, nearest hit to claimed line → corrected line), `verifyCandidate` → snippet re-sliced **from the file**, never model text |
| `domain/similarity.ts` | normalize + token Jaccard; `dedupeCandidates(batch, decidedRules)` |
| `domain/frequency.ts` | `chooseGrepLiteral` (model literal validated: single line, 6–80 chars, present in evidence file; else derived from snippet), `toPortableRegex` (escape, `\s+`, wrap `(?:…)` so it never starts with `-`), `countDistinctFiles` |
| `domain/skill-body.ts` | `skillNameFor(repo)` → `<repo>-conventions`; `assembleSkillBody` (H1, reviewer instruction, `##` per category, rule + rationale + "found in N files", `Evidence: path:Lx-Ly`, short fenced snippet with safe fence length); `evidenceFilesOf` |
| `ports.ts` | plain row interfaces (no ORM import); `ConventionsRepositoryPort` {listByRepo, latestScan, getById, update, setStatusMany, replacePending(tx: delete pending + insert kept + insert scan)}; narrow ports `RepoLookupPort`, `SkillCreatorPort`, `TokenCounter`; `ConventionsDeps` |
| `service.ts` | `board`, `update`, `setStatusMany`, `extract`, `skillDraft`, `createSkill` |
| `repository.ts` / `mappers.ts` | Drizzle impl, every query scoped by workspace (+repo); DTO mapping |
| `routes.ts` / `index.ts` | endpoints below; barrel |

**`extract(ws, repoId)` stages**
1. Guard: per-repo in-flight lock (409 `scan_in_progress`), repo lookup (404), `clonePath` null → 422 `repo_not_cloned` (covers seeded payments-api).
2. **Sample — code only (criterion 39):** read `CONFIG_SAMPLE_PATHS` (missing skipped) + **`repoIntel.getConventionSamples(repoId, 12)`** + up to 6 diversity extras from `repoIntel.getRankedPaths` (new facade method) in uncovered buckets incl. tests. Empty → 422 `repo_not_indexed`. Safe-path check, `git.readFile`, skip binary/empty, truncate to budget. Record `head_sha`.
3. Load decided (accepted+rejected) rules for the prompt.
4. **Propose:** `resolveModel(ws)` (Settings → Models, criterion 53) → `llm(provider)` (`ConfigError` → 422 `model_not_configured`) → one `completeStructured` (temp 0.1).
5. **Gate** → `dropped_ungrounded`. 6. **Dedupe** (batch + decided) → `dropped_duplicate`.
7. **Frequency:** `codeIndex.grep` per survivor (concurrency 4, per-pattern + total timeout, failures → `occurrences: null`); model literal matching ≤1 file → `dropped_rare`. Sort occurrences desc, then confidence.
8. **Persist** via `replacePending` (accepted/rejected untouched — criterion 48); scan row stores `apiCostUsd` only. Return board.

**`createSkill(ws, repoId, body)` — backend merge (criterion 42):** verify every `convention_ids` row is accepted & in this repo (422 otherwise); create ONE skill via `SkillCreatorPort` (type from body, `source: 'extracted'`, `evidence_files` from the accepted rows, v1). Returns the `Skill`. No agent link here — linking is done on the agent's Skills tab.

**Routes**
- `GET  /repos/:id/conventions` → `ConventionBoard`
- `POST /repos/:id/conventions/extract` → `ConventionBoard` (criterion 38)
- `PATCH /repos/:id/conventions` `{ids, status}` → board (Deselect all)
- `PATCH /conventions/:id` `{status?|rule?|rationale?|category?}` → candidate (Accept / Reject / inline Edit)
- `POST /repos/:id/conventions/skill-draft` `{ids?}` → `ConventionSkillDraft` (writes nothing; 422 when none accepted)
- `POST /repos/:id/conventions/skill` → `Skill` (source `extracted`)

**Wiring without depcruise violations** (`server/src/platform/container.ts`; register in `server/src/modules/index.ts`)
- New getters: `reposRepo` (`new RepoRepository(db)` satisfies `RepoLookupPort` structurally), `featureModels`, `conventionsRepo` (+ override key), `conventionsService` (composition root builds `ConventionsDeps`: repos, `repoIntel` (Pick getConventionSamples/getRankedPaths/getIndexState), `git` (readFile/currentHead), `codeIndex` (grep), `llm: p => this.llm(p)`, `resolveModel: ws => this.featureModels.resolve(ws,'conventions')`, `skills: SkillsService` (as `SkillCreatorPort`), `tokenizer`).
- **Settings refactor:** replace dead `settings/feature-models.ts` (3 baselined violations) with `settings/ports.ts` + `settings/repository.ts` + `settings/feature-models.service.ts` (`FeatureModelResolver.resolve/override`) → baseline **shrinks by 3**, regenerate and verify only those entries disappear.
- `repo-intel/types.ts` + `service.ts`: add `getRankedPaths(repoId, limit)` to the facade (returns `[]` when degraded; extend `test/repo-intel-facade-degraded.test.ts`).
- `db/seed.ts`: idempotent demo data — 3 accepted conventions for payments-api (91/78/85%, evidence paths from seeded PR files, occurrences) + 1 scan row, so the page and e2e have data.

## Client

**Refactor first (own commit), per frontend-ui-architecture rules (no cross-route `_components` imports):**
- Promote `SkillBodyEditor` (folder + tests) from `client/src/app/skills/[id]/_components/SkillEditor/_components/ConfigTab/_components/SkillBodyEditor` → `client/src/components/skills/SkillBodyEditor/`.
- Promote `TYPE_OPTIONS` (`ConfigTab/constants.ts:4`, duplicated in `ImportSkillDrawer.tsx:21`) → `client/src/lib/skill-types.ts`.
- Promote `relativeTime` (`app/repos/[repoId]/pulls/helpers.ts:11`) → `client/src/lib/relative-time.ts`.

**Nav (criteria 6, 44)** — `client/src/vendor/ui/nav.ts` (documented in-place exception): WORKSPACE keeps Pull Requests; new section **SKILLS LAB** = Skills, Agents, Conventions (`/repos/:repoId/conventions`, `g c` + `SHORTCUTS` entry). Eval Dashboard omitted (no route).

**Hooks** — `client/src/lib/hooks/conventions.ts`: `useConventions(repoId)`, `useExtractConventions` (mutation, seeds cache), `useUpdateConvention`, `useBulkUpdateConventions`, `useConventionSkillDraft` (query, gcTime 0), `useCreateSkillFromConventions` (invalidates `['skills']` — criterion 52). No double toasts (MutationCache already toasts).

**Route `client/src/app/repos/[repoId]/conventions/`** — thin `page.tsx`, `helpers.ts` (+test), `constants.ts`, `styles.ts` (hoist spread CSSProperties — TS2742 gotcha), `_components/`:
- `ConventionsView` — `<AppShell crumb>`; header "Conventions in `<repo>`" + "Detected from N sample files · last scan {relative}"; **"Run Scan"** when no scan exists (header + EmptyState CTA) vs **"Re-scan"** afterwards (criterion 45); scan summary (proposed / no evidence / duplicates / single-file / kept · cost · model); toolbar "Deselect all" + "{a} of {n} accepted" + **"Create skill" shown only when ≥1 accepted** (criterion 50); card list of non-rejected; collapsed "Rejected (n)" with Undo (rejected never in the skill — criterion 48); Skeleton / ErrorState / "Scanning…" states.
- `ConventionCard` — accent border when accepted; italic bold rule, category chip, rationale, "found in N files"; evidence header `path:start-end` (GitHub link via `githubBlobUrl`, pinned to scan `head_sha`) + copy button (PromptBlock pattern); mono snippet; confidence label + coloured `ProgressBar` (≥85 ok, ≥65 warn) + %; buttons **Accept / Reject / Edit** (criterion 47); **Edit = inline** rule/rationale/category form with Save/Cancel (criterion 49).
- `CreateSkillFromConventionsModal` — `CreateAgentModal` pattern; subtitle = skill name; banner "✦ Merged from **N accepted conventions** in <repo (accent)>. Everything below is editable before you save."; Name* (default `<repo>-conventions`), Description (default "N house conventions extracted from <repo>"), Type (convention), Enabled toggle + hint, **Skill body* via promoted `SkillBodyEditor`** (criterion 41; the modal body scrolls, footer stays pinned — both design shots show the same header/banner/Name/Description/footer, the second one scrolled to reveal Type/Enabled/body); **no agent select**; footer "Saved as v1 · added to Skills Lab", Cancel / ✦ Create skill → navigate to `/skills/:id`.
- Extend `messages/en/conventions.json` (keep existing keys).

## Tests
- **Server unit** (no Docker): `conventions-sampling`, `conventions-render-prompt` (incl. schema key order, rejected rules wrapped), `conventions-evidence-gate` (exact/suffix/ambiguous/traversal/backslash/CRLF/gutter/line correction), `conventions-similarity`, `conventions-frequency` (escaping compiles, leading `-`), `conventions-skill-body`, `conventions-service` (fakes + `MockLLMProvider`; counters; 409/422s; rejected rules in prompt; rescan keeps decided; rg failure → null; `apiCostUsd` persisted, `costUsd` ignored; createSkill rejects non-accepted ids, sets source `extracted` + evidence_files), `settings-feature-models`, `conventions-routes` (DB-free with `overrides:{auth:new MockAuthProvider()}`).
- **Server integration** `test/conventions.it.test.ts` (pattern of `skills-crud.it.test.ts`): extract drops an invented candidate → patch/bulk → rescan preserves decisions & drops near-dup of rejected → draft 422→200 → create skill appears in `GET /skills` → linking it via `POST /agents/:id/skills` puts it in the agent's prompt blocks → payments-api extract 422 → seeded board has 3 rows → workspace scoping.
- **Client**: `ConventionCard.test.tsx` (accept/reject/inline edit), `ConventionsView.test.tsx` (Run Scan vs Re-scan, Create skill hidden at 0, rejected collapsed), `CreateSkillFromConventionsModal.test.tsx`, `helpers.test.ts`; moved SkillBodyEditor tests.
- **e2e** `e2e/specs/11-conventions.flow.json` (read-only): sidebar → Conventions → 3 seeded rules + "3 of 3 accepted" → Create skill modal shows `payments-api-conventions` → Cancel; row in `e2e/README.md`.

## Build sequence (commit boundaries)
0. `docs: conventions extractor spec + plan` (server/client specs incl. Roadmap, index rows, `docs/plans/…`)
1. `refactor(server): feature-model resolver behind a settings port` (baseline −3)
2. `feat(shared): conventions contracts + cheap default conventions model`
3. `feat(server): conventions triage columns + convention_scans` (2 migrations)
4. `feat(server): expose getRankedPaths on the repo-intel facade`
5. `feat(server): conventions domain rules` (pure helpers + unit tests)
6. `feat(server): conventions module, skill creation, container wiring`
7. `feat(server): seed demo conventions for payments-api`
8. `refactor(client): promote SkillBodyEditor, skill type options, relativeTime`
9. `feat(client): Skills Lab nav + conventions hooks`
10. `feat(client): conventions board, card with inline edit, create-skill modal`
11. `test(e2e): conventions flow`
12. INSIGHTS entries via engineering-insights skill; `/pr-self-review` before any PR (no PR unless asked).

## Verification
- Server after each commit: `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'`, integration `pnpm exec vitest run .it.test` (Docker), `pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known` (baseline must not grow).
- Client: `cd client && pnpm typecheck && pnpm test`.
- DB: `pnpm db:migrate && pnpm db:seed`; confirm rows via psql after extract and after reload (criteria 38, 48).
- **Live run** (browser pane, `./scripts/dev.sh`): open the cloned+indexed `humen-dev/support-platform-fork` → Conventions → Run Scan → verify candidates grounded (file:line opens right line), occurrences shown, Accept/Reject/Edit, reload persistence, Re-scan doesn't resurrect rejected, Create skill → skill in `/skills` with body → open an agent → Skills tab → enable it → run a review → trace shows the skill block; Settings → Models → Conventions change takes effect (model in scan summary). payments-api shows the 3 seeded rows; Run Scan there returns the "clone first" message.
- Criteria checklist 38–53 + 6/44 ticked in the final report.

## Risks
- ripgrep adapter has no kill/timeout and unbounded stdout → literal-only patterns, caps, `Promise.race` budget; missing binary → null.
- Synchronous 20–60 s request; in-memory lock is single-process (job+SSE on roadmap).
- OpenAI-only users get 422 `model_not_configured` with a pointer to Settings → Models.
- Vendored contract drift → edit Conventions block identically, diff after.
- Snippets from untrusted code land in a trusted skill body → user reviews in modal; noted in spec.

## Out of scope (other homework criteria, not this feature)
- #43 four API Contract Reviewer skills (breaking-change, response-schema, semver-discipline, deprecation-policy) and #18 API Contract control experiment — not seeded on this branch; separate task.
