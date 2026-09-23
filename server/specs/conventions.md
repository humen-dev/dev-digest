# Conventions Extractor — spec (server)

Scan a cloned repository for the **house rules it already follows**, show each one
with the code that proves it, let a maintainer accept / reject / edit them, and merge
the accepted set into one skill. The resulting skill is linked to a reviewing agent
through the existing agent Skills tab (`POST /agents/:id/skills`), not by this feature.
Client side: [`../../client/specs/conventions.md`](../../client/specs/conventions.md).

Design premise: **a model is good at noticing a pattern and bad at remembering where it
saw it.** So the model only proposes; code chooses what it reads and code verifies
what it claims.

```
   SAMPLE (code)  ──►  PROPOSE (1 model call)  ──►  GATE (code)  ──►  DEDUPE (code)  ──►  FREQUENCY (ripgrep)  ──►  pending rows
```

## Decisions (locked)

| # | Decision | Consequence |
|---|---|---|
| D1 | Sampling is **100 % code** | Deterministic, reproducible; the model never chooses or browses files |
| D2 | The evidence gate is **code, not a second model** | A candidate whose snippet is not in the cited file is *dropped* |
| D3 | The stored snippet is **re-read from the file** | The UI never shows a model paraphrase as if it were code |
| D4 | A wrong line number is **corrected**, not fatal | Miscounting is a slip; inventing code is not |
| D5 | Triage is a 3-state `status` | A re-scan replaces only `pending`; accepted/rejected rows persist |
| D6 | Rejected + accepted rules are **fed back into the prompt** | The model is told not to re-propose them; code also dedupes against them |
| D7 | Frequency is **measured** (ripgrep), shown separately from confidence | "found in 42 files" is a measurement; confidence stays the model's judgement |
| D8 | Model comes from **Settings → Models → Conventions** (`feature_models.conventions`) | Never hardcoded; registry default is a cheap OpenRouter model |
| D9 | One scan = one `convention_scans` row with counters | "3 kept of 12 proposed" reads as "the gate worked", and survives reloads |
| D10 | Skill creation is a **backend merge** of accepted rows | Body assembled from verified DB rows, `source: 'extracted'` |

## Data model
- `conventions` (existing table, extended): `category` (text enum, default `other`),
  `rationale` (null), `evidence_line` (int, 1-based, **as verified by code**),
  `occurrences` (int, distinct files matching the rule's literal; `null` = not measured),
  `status` (`pending|accepted|rejected`, default `pending`, replaces the `accepted` bool),
  `created_at`. Index `(repo_id, status)`.
- `convention_scans` (new): counters `proposed`, `dropped_ungrounded`,
  `dropped_duplicate`, `dropped_rare`, `kept`; `sampled_files` (jsonb), `model`,
  `api_cost_usd` (**real cost only**, `null` otherwise), `head_sha`, `duration_ms`,
  `created_at`. Index `(repo_id, created_at)`.
- Enums are text enums without CHECK constraints (repo convention); zod validates at
  the edge. Migrations are append-only; not applied on boot.

## Contracts (`@devdigest/shared`, both vendored copies, `contracts/knowledge.ts`)
`ConventionCategory` · `ConventionStatus` · `ConventionCandidate` · `ConventionScan` ·
`ConventionBoard { candidates, last_scan }` · `ConventionSkillDraft`.
Categories: `naming, structure, imports, error_handling, typing, testing, api,
data_access, style, other`.

## API

All routes are workspace-scoped (`getContext`); ids are uuids (422 otherwise).

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/repos/:id/conventions` | — | `ConventionBoard` |
| POST | `/repos/:id/conventions/extract` | — | `ConventionBoard` (with the new `last_scan`) |
| PATCH | `/repos/:id/conventions` | `{ ids[], status }` | `ConventionBoard` (bulk, e.g. "Deselect all") |
| PATCH | `/conventions/:id` | `{ status?, rule?, rationale?, category? }` (≥1) | `ConventionCandidate` |
| POST | `/repos/:id/conventions/skill-draft` | `{ ids? }` | `ConventionSkillDraft` — **writes nothing** |
| POST | `/repos/:id/conventions/skill` | `{ name, description, type, enabled, body, convention_ids[] }` | `Skill` |

Errors: 404 unknown repo/convention (or other workspace) · 409 `scan_in_progress` ·
422 `repo_not_cloned` · 422 `repo_not_indexed` · 422 `model_not_configured` (points to
Settings → Models) · 422 `no_accepted_conventions` · 422 when `convention_ids`
contains a row that is not accepted or not in this repo.

## Extract — stages
1. **Guard.** One scan per repo at a time (in-process lock → 409). Repo must exist in the
   workspace and have a clone (`clone_path`), else 422 before any model call.
2. **Sample (code only).** Config wish-list (`package.json`, `tsconfig.json`,
   eslint / prettier / editorconfig / biome configs, `AGENTS.md`, `CLAUDE.md`,
   `CONTRIBUTING.md`; missing ones skipped) **+ `repoIntel.getConventionSamples(repoId, 12)`**
   **+ up to 6 diversity extras** from `repoIntel.getRankedPaths`: round-robin over layer
   buckets (test, route, service, data, ui, hook, util) the top-12 did not cover —
   **tests included**, since testing conventions are invisible in the top-12. Every path
   passes a safe-relative-path check; files are truncated per file and to a total budget,
   binary/empty files skipped. Nothing ranked → 422 `repo_not_indexed`.
3. **Render.** Each file gets a 1-based line-number gutter (what makes a citation
   checkable) and is fenced with `wrapUntrusted` — repo content is data, never instructions.
4. **Propose.** One `completeStructured` call (`schemaName: 'ConventionExtraction'`,
   temperature 0.1). The prompt includes the maintainer's accepted and rejected rules
   as "already decided — do not propose these or near-duplicates".
   **Schema field order is load-bearing:** `rule, rationale, evidence_path,
   evidence_line, evidence_snippet, grep_literal, category, confidence` — the model
   must observe before it judges; putting `category`/`confidence` first collapses
   categories and flattens confidence.
5. **Gate.** Per candidate: (a) the path resolves to a *sampled* file — exact, or a
   **unique** suffix match (ambiguity is dropped, never guessed); (b) the snippet has
   ≥ 8 non-space chars; (c) the snippet is found in the file (whitespace-insensitive,
   gutter stripped); the hit nearest the claimed line wins and becomes `evidence_line`.
   The stored snippet is sliced from the file. Failures → `dropped_ungrounded`.
6. **Dedupe.** Normalized-token Jaccard ≥ 0.6 against earlier (higher-confidence)
   candidates in the batch and against every accepted/rejected rule →
   `dropped_duplicate`.
7. **Frequency.** For each survivor, a grep literal (the model's, validated: one line,
   6–80 chars, present in the evidence file; else derived from the snippet) is escaped
   into a portable regex and run through `CodeIndex.grep`. `occurrences` = distinct
   files. Bounded by per-pattern and total timeouts and a concurrency cap; any
   failure → `occurrences: null` (kept, not penalized). A **model-supplied** literal
   matching ≤ 1 file → `dropped_rare` (a pattern in one file is a coincidence).
8. **Persist.** In one transaction: delete `pending` rows for the repo, insert the kept
   candidates as `pending`, insert the scan row. Accepted/rejected rows are never
   touched by a re-scan.

Ordering on read: `accepted`, `pending`, `rejected`; then `occurrences` desc (nulls
last); then `confidence` desc.

## Skill creation
- `skill-draft` assembles, from **accepted** rows (optionally filtered by `ids`):
  name `<repo>-conventions`, description `N house conventions extracted from <repo>`,
  type `convention`, enabled, a markdown body (H1, one reviewer instruction line,
  `##` per category, each rule with rationale, "found in N files", `Evidence: path:Lx-Ly`
  and a short fenced snippet whose fence is longer than any backtick run inside it),
  `body_tokens`, `evidence_files`.
- `skill` persists ONE skill (`source: 'extracted'`, `evidence_files` from the accepted
  rows, version 1) from the user-edited fields. It does **not** link an agent — linking
  is done on `/agents/:id` → Skills tab.

## Invariants
- The model never reads a file code did not choose; a cited path outside the sample is
  dropped, and paths are never joined onto the clone without the safe-path check.
- No candidate reaches the DB without passing the gate; the snippet is file text.
- A re-scan never resurrects a rejected rule and never changes a decided row.
- Real cost only: `api_cost_usd` stores `StructuredResult.apiCostUsd`, never `costUsd`.
- Approved snippets become trusted skill text — the user reviews the body in the modal
  before it is saved.

## Testing
- **Unit (no Docker):** sampling buckets/extras/safe paths; gutter + prompt (field order,
  decided rules wrapped); evidence gate (exact/suffix/ambiguous/traversal/backslashes/
  CRLF/line correction); similarity; frequency literal + regex escaping; skill body;
  service with fakes + `MockLLMProvider` (counters, errors, decided rules in prompt,
  rg failure → `null`, real cost only); routes DB-free (`MockAuthProvider`).
- **Integration (`conventions.it.test.ts`):** extract drops an invented candidate →
  patch / bulk → re-scan keeps decisions and drops a near-duplicate of a rejected rule →
  draft → create skill → visible in `GET /skills` → linking it via
  `POST /agents/:id/skills` adds it to the agent's prompt blocks; seeded
  `payments-api` → 422 `repo_not_cloned`; workspace scoping.

## Roadmap — more findings, better findings (not implemented)
The gate stays strict; quality work means feeding it more real signal.

**Better input**
1. **Git history & review comments.** A rule reviewers have *already asked for twice*
   (repeated fix-up commits on high-churn files, DevDigest's own accepted findings) is
   the strongest possible candidate.
2. **Two-step dialogue.** Let the model pick files from a code-built list of ~100
   ranked paths (`ConventionFileSelection`, the mock seam already exists) — it ranks,
   it never browses.
3. **Clone-walk fallback** for repos without a `file_rank` (non-TS repos).

**Better verification**
4. **Counter-examples.** "Holds in 38 files, 3 break it" — grades the rule and yields a
   cleanup task.
5. **Contradiction check** against existing skills before a new rule lands.
6. **AST patterns** (ast-grep) for structural rules a literal cannot express.

**Better loop**
7. **Scheduled / on-merge re-scans** diffed against the last scan, so conventions drift
   with the codebase.
8. **Close the loop through review outcomes:** a convention whose findings keep being
   dismissed is a bad rule — the eval dashboard can measure it.
9. **Skill per category** as an alternative Create mode.
10. **Run extraction as a job with SSE progress** instead of a synchronous request, and
    add a kill/timeout option to `CodeIndex.grep`.
