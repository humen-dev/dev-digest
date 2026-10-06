# Onboarding Tour — development plan

| Field | Value |
|---|---|
| Status | approved |
| Goal | A user opens `/repos/:repoId/tour` and gets a grounded five-section tour of an indexed repository. The tour can be generated synchronously, shows a stale banner, and supports copy, share and Markdown export. |
| Requirements source | [`specs/2026-10-06-onboarding-tour-reference-aligned.md`](../../specs/2026-10-06-onboarding-tour-reference-aligned.md) (SPEC-03, supersedes SPEC-02). This plan never edits it. |
| Execution mode | multi-agent (parallel waves), chosen by the user |
| Packages touched | server · client · e2e · shared (vendored in server + client) |

## 1. Context
Today there is scaffolding and no feature:
- No nav entry and no route (`client/src/vendor/ui/nav.ts:21-28`).
- `activeKeyFor` maps every path containing `/onboarding` to `onboarding-tour`, which wrongly includes the wizard (`client/src/components/app-shell/helpers.ts:29`).
- The unused `onboarding` table has no commit, model or cost (`server/src/db/schema/context.ts:120-126`).
- The generic `Onboarding` contract is unused, apart from one contract test (`server/src/vendor/shared/contracts/knowledge.ts:28-47`, `server/test/contracts.test.ts:139`).
- The old prompt template describes other sections (`server/src/prompts/onboarding.system.md:1-45`).
- The copy is wrong (`client/messages/en/onboarding.json:10`).
- Index methods meant for onboarding are unused (`server/src/modules/repo-intel/service.ts:655-718`).
- A strict Mermaid renderer exists but is unused (`client/src/components/mermaid-diagram/MermaidDiagram.tsx:22-59`).

Precedents to copy:
- The conventions module: one LLM call, an in-process `inFlight` set, narrow ports, a 422 for a missing clone, and the 10/min rate limit (`server/src/modules/conventions/service.ts:60,102-125,143-162`, `routes.ts:33`, `ports.ts:120-133`).
- The Project Context page shell (`client/src/app/repos/[repoId]/context/_components/ProjectContextView/ProjectContextView.tsx:21-58`).

INSIGHTS relied on:
- server 2026-09-22 / 2026-09-27: plain row interfaces in `ports.ts`; no adapter imports in ports.
- server 2026-09-24: shared helpers go in `_shared/`.
- server 2026-09-27: the seed is insert-once.
- server 2026-09-18: persist the real cost only.
- client 2026-09-29: gate error states on `!data`; no `user-event`, use `fireEvent`.
- client 2026-09-27: import only types from `@devdigest/shared`.
- client 2026-09-23: the vendored copies drift; the e2e flows depend on literal strings.

### Requirements review
SPEC-03 is user-approved. The file still says `Status: draft` (`specs/…-reference-aligned.md:4`) and is being flipped. The approved-spec fast path applies. The upstream reference (`3ac81799334e`) was not read, because there is no shell; SPEC-03 is normative. Findings:
1. **AC-37** counts one `completeStructured` port call; repairs inside the adapter (`server/src/adapters/llm/openai.ts:90-133`) do not count. **Accepted by the user.**
2. **Do not use JobRunner.** Its retries and 120 s per attempt (`server/src/platform/jobs.ts:41-42`) would break AC-37 and EC-12. Use an in-process `inFlight` set with a synchronous 120 s timeout. **Accepted.**
3. **Absent index row.** `getIndexState` synthesises `status:'degraded', lastIndexedSha:''` when there is no row (`server/src/modules/repo-intel/service.ts:192-207`). Absent ⇔ `lastIndexedSha === ''` (EC-34 `repo_not_indexed`, EC-36).
4. **Git listing.** The git port cannot list tracked files at a commit (`server/src/adapters/git/simple-git.ts:90-137`), and `GitClient` is vendored. Add a new narrow adapter (`git ls-tree -r -l -z`) instead of changing the vendored interface. Symlink (`120000`) and submodule (`160000`) entries are excluded. All reads go through git objects (`readFileAt` = `git show`), which closes UT-5.
5. **Importer counts (AC-27).** The repo-intel facade has no importer-count read (`server/src/modules/repo-intel/types.ts:155-195`). Add `getImporterCounts` over `file_edges` (index `file_edges_repo_to_idx`, `server/src/db/schema/repo-intel.ts:55-68`). `FakeRepoIntel` implements the interface (`server/test/helpers/blast-fakes.ts:56`), so it must be updated too.
6. **Secret patterns (UT-7, UT-8).** They live in `project-context/domain/secrets.ts:8-21`, which `no-cross-module-internals` forbids importing (`server/.dependency-cruiser.cjs:146-158`). Promote them to `modules/_shared/secrets.ts` and keep the old path as a re-export.
7. **UT-3.** `wrapUntrusted` does not escape its label (`reviewer-core/src/prompt.ts:52`). The server escapes the path before calling it; reviewer-core stays unchanged.
8. **NFR-7.** `@fastify/rate-limit` is not registered under `nodeEnv === 'test'` (`server/src/app.ts:95-97`). The test builds the app with a non-test `nodeEnv`.
9. **Excluded dirs (AC-39, AC-42, UT-12).** `EXCLUDED_DIRS` and `MAX_FILE_SIZE` are repo-intel internals (`server/src/modules/repo-intel/constants.ts:29-48,70`). Re-export them from `repo-intel/types.ts` (public surface). The domain receives them as parameters. AC-42 reuses `config.projectDocsExcludedDirs` (`server/src/platform/config.ts:36,99`).
10. **AC-15 path chips.** The vendored `<Markdown>` takes no component overrides (`client/src/vendor/ui/primitives/Markdown.tsx:18`). The tour renders its overview with `react-markdown` directly (a client dependency, `client/package.json:20`), with the same defaults: no `rehype-raw`, default `urlTransform`. This keeps UT-9 and avoids a vendor edit.
11. **No `api.ts` change.** `apiFetch` sets no timeout (`client/src/lib/api.ts:21-33`), so the ≥ 125 s client wait from the SPEC-03 Assumptions holds without editing it.

Recommendations from the SPEC-02 round (diagram layout, job-queue detection, current commit) are **moot** under SPEC-03.

### Decisions
1. **Storage: extend the `onboarding` table** with nullable `tour_commit`, `model`, `api_cost_usd`, `duration_ms` (migration `0017`). The sections, counters and counts live in `json`, validated as `TourDocument`. Rejected: a new table plus dropping the old one, which is destructive for no gain. Legacy rows have a null `tour_commit` or invalid `json`, and read as "no tour" (EC-19).
2. **`POST …/generate` returns `OnboardingTour`** (AC-31 "responds with the stored tour"). `GET` returns `OnboardingTourState`. The client merges the POST result into the GET cache.
3. **The `inFlight` entry is released when the underlying work settles,** not at the 504. A result that arrives after the timeout is discarded and never stored (EC-12). A repeat request inside that window gets 409 (EC-7).
4. **Domain stays pure.** File reading, token counting and secret checks are injected or done by the service; domain functions take parameters only.
5. **The draft schema uses `''` for "none"** (no diagram, no note), so the strict JSON-schema mode works on every provider. `''` maps to `null` on store (AC-66).
6. **The tour contract goes in a new vendored file** `contracts/onboarding-tour.ts`. The `Onboarding` block is deleted from both `knowledge.ts` copies identically, as SPEC-03 *Compatibility* requires.

### Open questions
none

## 2. Affected modules
| Package | Touched? | Why / what changes | Architecture rule that applies |
|---|---|---|---|
| server | yes | new `modules/onboarding` (domain, ports, service, repository, mappers, routes); git-tree adapter; repo-intel facade read; `_shared/secrets.ts`; migration; seed; prompt | onion: domain ring 1 · service/ports ring 2 · repository/adapter ring 3 · routes/container ring 4 |
| client | yes | route `repos/[repoId]/tour`, `_components/TourSections` + `TourView`, hook `lib/hooks/onboarding-tour.ts`, nav + `activeKeyFor`, i18n | frontend-ui-architecture: page thin → view → hooks → `api.ts` |
| reviewer-core | no | only `wrapUntrusted` is reused; grounding gate and `INJECTION_GUARD` untouched | — |
| e2e | yes | new flow `16-onboarding-tour.flow.json` | deterministic, seeded data |
| shared (vendored) | yes | new `contracts/onboarding-tour.ts`, `Onboarding` block removed, barrel export — identical in both copies | Wave 0 only |

## 3. Contracts (the Interfaces every unit agrees on)

### 3.1 Shared — `src/vendor/shared/contracts/onboarding-tour.ts` (server + client, byte-identical)
```ts
import { z } from 'zod';
export const TourSectionKind = z.enum(['architecture_overview', 'critical_paths', 'how_to_run', 'guided_reading', 'first_tasks']);
export type TourSectionKind = z.infer<typeof TourSectionKind>;
export const TourComplexity = z.enum(['low', 'medium', 'high']);
export type TourComplexity = z.infer<typeof TourComplexity>;
export const TourCounter = z.object({ proposed: z.number().int().min(0), dropped: z.number().int().min(0) });
export type TourCounter = z.infer<typeof TourCounter>;
export const TourArchitecture = z.object({
  overview: z.string(),                // Markdown, ≤ 1,500 chars (AC-53)
  overview_paths: z.array(z.string()), // inline code spans equal to a tracked file (AC-14)
  diagram: z.string().nullable(),      // model-written Mermaid; null = none (AC-66)
});
export type TourArchitecture = z.infer<typeof TourArchitecture>;
export const TourPathItem = z.object({ path: z.string(), note: z.string(), importer_count: z.number().int().min(0).nullable() });
export type TourPathItem = z.infer<typeof TourPathItem>;
export const TourReadingItem = z.object({ path: z.string(), reason: z.string(), importer_count: z.number().int().min(0).nullable() });
export type TourReadingItem = z.infer<typeof TourReadingItem>;
export const TourStep = z.object({ command: z.string(), note: z.string().nullable(), source: z.string() });
export type TourStep = z.infer<typeof TourStep>;
export const TourTask = z.object({ title: z.string(), target: z.string(), complexity: TourComplexity, new_file: z.boolean() });
export type TourTask = z.infer<typeof TourTask>;
export const TourCounters = z.object({ critical_paths: TourCounter, how_to_run: TourCounter, guided_reading: TourCounter, first_tasks: TourCounter });
export type TourCounters = z.infer<typeof TourCounters>;
export const OnboardingTour = z.object({
  repo_id: z.string(),
  tour_commit: z.string(),             // last_indexed_sha at generation start (AC-38)
  generated_at: z.string(),            // ISO
  tracked_file_count: z.number().int().min(0),
  indexed_file_count: z.number().int().min(0),
  model: z.string(),
  api_cost_usd: z.number().nullable(), // real provider cost only (NFR-11)
  duration_ms: z.number().int().min(0),
  architecture: TourArchitecture,
  critical_paths: z.array(TourPathItem),
  how_to_run: z.array(TourStep),
  guided_reading: z.array(TourReadingItem),
  first_tasks: z.array(TourTask),
  counters: TourCounters,
});
export type OnboardingTour = z.infer<typeof OnboardingTour>;
export const TourIndexStatus = z.enum(['full', 'partial', 'degraded', 'failed']);
export type TourIndexStatus = z.infer<typeof TourIndexStatus>;
export const OnboardingTourState = z.object({
  tour: OnboardingTour.nullable(),
  cloned: z.boolean(),
  index_status: TourIndexStatus.nullable(), // null = no repo_index_state row
  generating: z.boolean(),                  // generation in flight in this API process
  stale: z.boolean(),                       // AC-67; false without tour or index state (EC-36)
  current_commit: z.string().nullable(),    // current last_indexed_sha; null = no index state
});
export type OnboardingTourState = z.infer<typeof OnboardingTourState>;
```
Both `index.ts` barrels gain `export * from './contracts/onboarding-tour.js';`, and the header comment line drops "Onboarding". Lines 28-47 of both `contracts/knowledge.ts` (the `Onboarding*` block) are deleted.

### 3.2 HTTP (module `onboarding`, workspace-scoped through `getContext`)
| Method · path | Success | Errors (`{error:{code,message}}`) |
|---|---|---|
| `GET /repos/:id/tour` | 200 `OnboardingTourState` | 404 `not_found` |
| `POST /repos/:id/tour/generate` (no body; `config.rateLimit {max:10, timeWindow:'1 minute'}`) | 200 `OnboardingTour` | 404 `not_found` · 409 `generation_in_progress` · 422 `repo_not_cloned` / `repo_not_indexed` / `index_not_ready` / `model_not_configured` / `repo_empty` / `nothing_grounded` · 504 `generation_timeout` · 502 provider error (AppError passed through, else `external_service_error` with the provider message) · 429 |

Check order before any LLM call: repo (404) → in flight (409) → clone (422) → index ready (422) → model key (422) → tracked files at the tour commit (422 `repo_empty`).

### 3.3 DB — `server/src/db/schema/context.ts` `onboarding` + migration `0017_onboarding_tour.sql`
```ts
export const onboarding = pgTable('onboarding', {
  repoId: uuid('repo_id').primaryKey().references(() => repos.id, { onDelete: 'cascade' }),
  json: jsonb('json').notNull(),                 // TourDocument (§3.4)
  generatedAt: timestamp('generated_at', { withTimezone: true }).defaultNow().notNull(),
  tourCommit: text('tour_commit'),               // null = legacy row → "no tour"
  model: text('model'),
  apiCostUsd: doublePrecision('api_cost_usd'),
  durationMs: integer('duration_ms'),
});
```
Generated with `cd server && pnpm db:generate --name onboarding_tour` (adds the `0017` SQL and `meta/` snapshot + journal entry). All four columns are nullable ADDs; no data rewrite.

### 3.4 Server-local — `server/src/modules/onboarding/types.ts` (Wave 0)
```ts
import { z } from 'zod';
import { OnboardingTour, TourComplexity } from '@devdigest/shared';
/** Stored in onboarding.json. */
export const TourDocument = OnboardingTour.pick({
  tracked_file_count: true, indexed_file_count: true, architecture: true, critical_paths: true,
  how_to_run: true, guided_reading: true, first_tasks: true, counters: true,
});
export type TourDocument = z.infer<typeof TourDocument>;
/** Model output — one completeStructured call. '' means "none". */
export const TourDraft = z.object({
  overview: z.string(),
  diagram: z.string(),
  critical_paths: z.array(z.object({ path: z.string(), note: z.string() })),
  how_to_run: z.array(z.object({ command: z.string(), note: z.string() })),
  guided_reading: z.array(z.object({ path: z.string(), reason: z.string() })),
  first_tasks: z.array(z.object({ title: z.string(), target: z.string(), complexity: TourComplexity })),
});
export type TourDraft = z.infer<typeof TourDraft>;
export const TOUR_DRAFT_SCHEMA_NAME = 'OnboardingTourDraft';
export interface TrackedFile { path: string; size: number } // POSIX path, blob bytes
export interface InputFile { path: string; text: string }
export interface PromptInput { repoName: string; tree: string[]; excerpts: InputFile[]; commandFiles: InputFile[] }
```

### 3.5 Pure domain API (Wave 1 produces, U5 consumes)
```ts
// domain/grounding.ts (U1)
export interface GroundingContext {
  tracked: ReadonlySet<string>;                 // tracked paths at the tour commit
  candidates: ReadonlySet<string>;              // AC-44 candidate files
  commandSources: ReadonlyMap<string, string>;  // command source path → text
}
export type GroundedTour = Omit<TourDocument, 'tracked_file_count' | 'indexed_file_count'>; // importer_count = null
export function groundTour(draft: TourDraft, ctx: GroundingContext): GroundedTour;
export function isEmptyTour(t: GroundedTour): boolean; // all 5 sections empty (EC-14)
// domain/commands.ts (U1)
export function groundCommand(command: string, sources: ReadonlyMap<string, string>): string | null; // source path
// _shared/secrets.ts (U1)
export function containsSecretValue(text: string): boolean;
export function redactSecretValues(text: string): string; // matches → '***'
// domain/input.ts (U2)
export function isExcludedPath(path: string, excludedDirs: readonly string[]): boolean;
export function isReadableInput(path: string, size: number, maxBytes: number): boolean; // UT-6, UT-12
export function buildFileTree(tracked: readonly string[], ranked: readonly string[], excludedDirs: readonly string[]): string[];
export function excerptOf(text: string): string | null; // first 120 lines; null if any line > 1,000 chars
export function fitToBudget(input: PromptInput, countTokens: (i: PromptInput) => number, budget?: number): PromptInput;
// domain/prompt.ts (U2)
export function escapePathLabel(path: string): string;
export function buildMessages(systemPrompt: string, input: PromptInput): StructuredRequest<unknown>['messages'];
// adapters/git/tree.ts (U3)
export class GitTreeReader { constructor(cloneDir: string); listTrackedFiles(repo: RepoRef, ref: string): Promise<{ path: string; size: number }[]>; }
// repo-intel/types.ts (U3): RepoIntel gains
getImporterCounts(repoId: string, paths: string[]): Promise<Record<string, number>>; // distinct from_file per to_file
export { EXCLUDED_DIRS, MAX_FILE_SIZE } from './constants.js';
```

### 3.6 i18n — `client/messages/en/onboarding.json` (Wave 0, full rewrite)
Keys:
- `title`, `crumb` ("Onboarding Tour"), `heading` ("Onboarding for {repoName}")
- `subtitle` ("Generated from {files} files · last refreshed {ago} ago"), `subtitleIndexed` ("· indexed {count}")
- `sections.<kind>` (the five titles), `sections.empty` (EC-15)
- `toc.title` ("ON THIS PAGE"), `toc.label` ("On this page")
- `actions.{generate, regenerate, generating, retry, reanalyze, shareLink, copyMarkdown, copyAll, copy, copyStep ("Copy step {n}"), copied, open, openAria ("Open {path} on GitHub"), cloneToRegenerate}`
- `toast.{linkCopied, copyFailed}`
- `paths.importedBy` ("imported by {count} files")
- `tasks.complexity.{low,medium,high}` ("Low complexity" …), `tasks.newFile` ("new file")
- `stale.banner` ("This tour was generated from index {from}; the index is now at {to}.")
- `footer` ("{model} · {cost} · {seconds} s · {dropped} items dropped as unverified")
- `generate.{title, body, cta}` (AC-29 text exactly)
- `notCloned.{title, body}` (EC-1)
- `notReady.{notIndexed, failed, other}` (EC-35)
- `inProgress` (EC-8)
- `loadError.title` (EC-26)
- `diagramAlt`

All texts are verbatim from SPEC-03.

## 4. Work units

### U1 — Grounding domain + shared secret patterns
| Field | Value |
|---|---|
| Kind | backend (→ `implementer-backend`) |
| Wave | 1 |
| Depends on | Wave 0 |
| Owns (create/modify) | `server/src/modules/onboarding/domain/{grounding,commands,paths,text}.ts`; `server/src/modules/_shared/secrets.ts` (new); `server/src/modules/project-context/domain/secrets.ts` (becomes a re-export); `server/test/onboarding-grounding.test.ts`, `server/test/onboarding-commands.test.ts` |
| Must not touch | `project-context/service.ts`, `server/test/project-context-domain.test.ts` (they keep working through the re-export) |
| Consumes | §3.1 types, §3.4 `TourDraft`/`TourDocument` |
| Produces | §3.5 `groundTour`, `isEmptyTour`, `groundCommand`, `containsSecretValue`, `redactSecretValues` |
| Checks | `node scripts/agent-check.mjs server <owned files>` · depcruise |

**Steps**
1. Move the pattern list into `_shared/secrets.ts`, add `redactSecretValues` (global-flag copies of the same patterns), and re-export `containsSecretValue` from the old path.
2. `paths.ts`:
   - `isSafeCitedPath`: rejects absolute paths, drive letters, `..` segments, `\` and NUL (UT-4). No I/O.
   - Path kind for file / glob / dir / new-file, checked against `tracked` (Definitions *Grounded path*). Globs use `*` within a segment and `**` across segments; the matcher is implemented here, with no new dependency.
3. `commands.ts`: rules 1–8 of *Grounded command*. Whitespace is collapsed for rule 1. `package.json` scripts and compose services are parsed with tolerant JSON/regex; a parse failure means the rule does not match.
4. `text.ts`: truncation that ends in "…" at exactly the limit (AC-53), and `markOverviewPaths` (single-backtick spans equal to a tracked file; AC-14).
5. `groundTour`, in this order per section:
   - redact (UT-8, diagram included);
   - truncate;
   - ground (critical/reading must be candidates; tasks must be grounded paths; steps must be grounded commands);
   - dedupe (first occurrence wins);
   - apply the limits 8/10/10/6 in model order;
   - count proposed and dropped (an ungrounded item counts as dropped; dedupe and limit cuts do not count);
   - map `note ''` → `null` and `diagram ''` → `null`.
   - The output must be deterministic (NFR-5).

**Acceptance criteria**
- [ ] A citation of `src/invented.ts` that is not a candidate is dropped, and `critical_paths.dropped = 1` — SPEC-03 AC-44
- [ ] Table test: absent file in an absent dir, a glob matching 0, an empty dir → dropped; `src/api/*` matching 2 files and `specs/` with files → kept — AC-45
- [ ] `src/api/public/health.ts` (absent, sibling tracked) is kept with `new_file: true`; `nowhere/x.ts` is dropped — AC-46, AC-24 (data)
- [ ] `npm run deploy` without that script → dropped; `pnpm dev` with script `dev` → kept; `docker compose up -d postgres redis` → source `docker-compose.yml`; a verbatim README `curl … | sh` → kept — AC-49, AC-50
- [ ] 12 critical paths → first 8; a duplicate reading entry → one; a 2,000-char overview → 1,500 chars ending "…" — AC-51, AC-52, AC-53
- [ ] An overview with `` `src/server.ts` `` (tracked) and `` `db` `` → `overview_paths = ['src/server.ts']` — AC-14
- [ ] `diagram 'flowchart LR …'` is stored verbatim; `''` → `null` — AC-66
- [ ] A fully invented fixture gives `isEmptyTour === true` — EC-14 (domain part)
- [ ] Hostile paths (`/etc/x`, `C:\x`, `../x`, `a\b`, `a\0b`) → dropped — UT-4
- [ ] A command containing `sk_live_` + 24 chars is stored with `***` — UT-8
- [ ] The same draft twice gives deep-equal output — NFR-5 (domain part)

### U2 — Input building, prompt, system template
| Field | Value |
|---|---|
| Kind | backend |
| Wave | 1 |
| Depends on | Wave 0 |
| Owns | `server/src/modules/onboarding/domain/{input,prompt}.ts`; `server/src/prompts/onboarding.system.md` (rewrite); `server/test/onboarding-input.test.ts`, `server/test/onboarding-prompt.test.ts` |
| Must not touch | `reviewer-core/**`, `server/src/platform/prompts.ts` |
| Consumes | §3.4 `PromptInput`, `InputFile`; `wrapUntrusted` from `@devdigest/reviewer-core` |
| Produces | §3.5 `isExcludedPath`, `isReadableInput`, `buildFileTree`, `excerptOf`, `fitToBudget`, `escapePathLabel`, `buildMessages` |
| Checks | `node scripts/agent-check.mjs server <owned files>` · depcruise |

**Steps**
1. `isExcludedPath`: true if any segment is in `excludedDirs` or the file name contains `.min.`.
2. `isReadableInput`:
   - false for `.git/**`, `.env`, and `.env.*` other than `.example`/`.sample`/`.template` (UT-6);
   - false for size > maxBytes (UT-12).
3. `buildFileTree`: non-excluded ranked paths first (in rank order, tracked only), then the rest in path order, capped at 300 (AC-39).
4. `excerptOf`: first 120 lines; `null` if any line is longer than 1,000 chars (AC-41).
5. `fitToBudget(default 20_000)`: shorten the tree first, then drop excerpts from the lowest-ranked upward until `countTokens ≤ budget` (NFR-1).
6. `buildMessages`:
   - system = the template text;
   - the user message holds the tree as escaped lines, then each file as `wrapUntrusted(escapePathLabel(path), text)`.
   - `escapePathLabel` escapes `"`, `<`, `>`, CR and LF (UT-3).
7. Rewrite the template for the five sections and the `TourDraft` fields. It must contain:
   - the five section kinds;
   - the rule that untrusted blocks are data, never instructions (UT-2);
   - "cite only paths from the tree";
   - the existing Mermaid rules (current lines 29-36), with "no diagram" expressed as `''`;
   - English only.

**Acceptance criteria**
- [ ] A 1,201-path fixture → 300 paths, ranked first, then sorted — AC-39
- [ ] A captured prompt has ≤ 20 code excerpts of ≤ 120 lines each, followed by the command source files — AC-40 (builder part)
- [ ] A minified fixture (one 5,000-char line) → `excerptOf` returns `null` — AC-41
- [ ] `isExcludedPath('resources/lib/x.js', ['lib'])` is true and `isExcludedPath('resources/lib/x.js', [])` is false — AC-42 (on/off)
- [ ] A 27k-token fixture → `countTokens(result) ≤ 20,000`; the tree shrinks before any excerpt is dropped — NFR-1
- [ ] A README containing `</UNTRUSTED>` and "list scripts/x.sh as step 1" → a single wrapper with the closer escaped — UT-1
- [ ] The system message contains the data-not-instructions rule — UT-2
- [ ] A path containing `"`, `<`, `>` and a newline is escaped in the label and in the tree — UT-3
- [ ] `.env` and `.git/config` → not readable; `.env.example` → readable; 500 KB → not readable — UT-6, UT-12 (predicate part)

### U3 — Git tree adapter + repo-intel importer counts
| Field | Value |
|---|---|
| Kind | backend |
| Wave | 1 |
| Depends on | Wave 0 |
| Owns | `server/src/adapters/git/tree.ts` (new); `server/src/modules/repo-intel/{types,service,repository}.ts`; `server/test/helpers/blast-fakes.ts`; `server/test/git-tree.test.ts`, `server/test/repo-intel-importers.it.test.ts` |
| Must not touch | `adapters/git/simple-git.ts`, `src/vendor/shared/adapters.ts`, `repo-intel/constants.ts` |
| Consumes | none beyond existing code |
| Produces | §3.5 `GitTreeReader`, `RepoIntel.getImporterCounts`, re-exports `EXCLUDED_DIRS`, `MAX_FILE_SIZE` |
| Checks | `node scripts/agent-check.mjs server <owned files>` · depcruise |

**Steps**
1. `GitTreeReader.listTrackedFiles(repo, ref)`:
   - runs `git ls-tree -r -l -z <ref>` through simple-git in `<cloneDir>/<owner>/<name>`;
   - parses mode/type/size/path;
   - keeps blob entries only (mode `100644`/`100755`), so symlinks `120000` and gitlinks `160000` are skipped;
   - returns POSIX paths. A ref the clone cannot resolve throws.
2. `getImporterCounts`:
   - repository: `SELECT to_file, count(DISTINCT from_file) … WHERE repo_id = $1 AND to_file = ANY($2) GROUP BY to_file`;
   - service: returns `{}` when `repoIntelEnabled` is false or `paths` is empty; absent keys mean 0.
3. Add the method to `FakeRepoIntel`, plus the re-exports in `types.ts`.

**Acceptance criteria**
- [ ] A temp repo with files `a.ts`, `src/b.ts` and a symlink `link → ../outside` → `listTrackedFiles` returns the two files with sizes and no symlink — UT-5 (adapter part)
- [ ] Listing at commit A after HEAD moved to B returns A's files — AC-38 (adapter part)
- [ ] An index fixture with 3 distinct importers of `a.ts` (plus a duplicate edge) → `{ 'a.ts': 3 }` — AC-27 (facade part)
- [ ] Depcruise: no new violation; the baseline did not grow

### U4 — Tour section components (presentational)
| Field | Value |
|---|---|
| Kind | ui (→ `implementer-ui`) |
| Wave | 1 |
| Depends on | Wave 0 |
| Owns | `client/src/app/repos/[repoId]/tour/_components/TourSections/**` (`TourSections.tsx`, `index.ts`, `constants.ts`, `helpers.ts`, `styles.ts`, `hooks/useCopyToClipboard.ts`, `_components/{SectionCard,ArchitectureSection,CriticalPaths,HowToRun,GuidedReading,FirstTasks,PathRef}/**`, colocated `*.test.tsx`) |
| Must not touch | `client/src/vendor/**`, `client/src/components/mermaid-diagram/**`, `client/src/lib/**`, `client/messages/**` |
| Consumes | §3.1 types (`import type`), §3.6 keys, `MermaidDiagram`, `githubBlobUrl`, `useToast` |
| Produces | `TourSections` with props `{ tour, repoFullName, cloned, expanded: Record<TourSectionKind, boolean>, onToggle(kind), registerSection(kind, el) }`; `TOUR_SECTION_ORDER`; `useCopyToClipboard()` → `{ copy(text, controlId), copiedId }` |
| Checks | `node scripts/agent-check.mjs client <owned files>` |

**Steps**
1. `SectionCard`:
   - header `<button aria-expanded>` with an icon and the title;
   - `id={kind}` and `scrollMarginTop`;
   - EC-15 text when it has no items.
2. `ArchitectureSection`:
   - overview through `react-markdown` + `remark-gfm` (no `rehype-raw`);
   - a `code` override renders a span listed in `overview_paths` as a `PathRef` chip;
   - then `<MermaidDiagram chart={diagram}>` only when `diagram` is non-null.
3. `PathRef`:
   - with a clone: an anchor `githubBlobUrl(repoFullName, tour_commit, path)` with `target="_blank"`, `rel="noopener noreferrer"`, and aria-label from `actions.openAria`;
   - without a clone: plain text;
   - CSS ellipsis with `title` = full path;
   - "imported by N files" when the count is ≥ 1.
4. Rows and lists per AC-17, 18, 22, 23:
   - steps have a source chip, copy, and "Copy all";
   - tasks show the complexity badge (ok / warn / critical tokens) and the "new file" badge;
   - task cards use a responsive grid (one column under 768 px, EC-21).
5. `useCopyToClipboard`:
   - `navigator.clipboard.writeText`;
   - "Copied" on that control for 2 s;
   - on rejection, `toast.copyFailed`.

**Acceptance criteria**
- [ ] 5 cards in section order, all expanded; clicking a header hides and then shows the content; headers are buttons with `aria-expanded` — SPEC-03 AC-3, AC-5, NFR-8
- [ ] Overview `**bold**` + `` `code` `` → `strong` + `code`; a marked span → chip link href — AC-13, AC-15
- [ ] A hostile overview (`<script>`, `[x](javascript:alert(1))`) → no `script` element and no `javascript:` href — UT-9
- [ ] A diagram is passed to `MermaidDiagram`. With a mocked `mermaid` module, `initialize` is called with `securityLevel:'strict'` and `parse` before `render`. Junk or invalid text → no diagram container and no error text; `null` → no diagram area — AC-65, EC-28, UT-10
- [ ] 4 critical rows with icon, path, "— note" and Open; Open href `…/blob/<sha>/a%20b/c%23d.ts` with `_blank` + `noopener noreferrer`; reading paths link the same way — AC-17, AC-25, AC-26, UT-11
- [ ] `cloned=false` → no Open link; paths as plain text — EC-3 (component part)
- [ ] Step `pnpm dev` + note + source `package.json` renders all parts; copy writes exactly `pnpm dev`; Copy all writes 4 lines; "Copied" disappears after 2 s (fake timers); a rejected clipboard → toast "Couldn't copy to clipboard" — AC-18, AC-19, AC-20, AC-21, EC-22
- [ ] 3 reading entries are numbered 1–3 with path and reason — AC-22
- [ ] Low / Medium / High badges with their colour tokens; "new file" only on the marked card — AC-23, AC-24
- [ ] Counts 3 and 0 → badge only on the first — AC-28, EC-29
- [ ] A long path has `title` and accessible name = the full path — EC-20
- [ ] An empty critical-paths section shows the EC-15 text — EC-15
- [ ] Copy and Open controls have the names "Copy step 2" and "Open src/server.ts on GitHub"; no literal UI strings — NFR-8, NFR-10

### U5 — Onboarding module: service, persistence, routes, wiring
| Field | Value |
|---|---|
| Kind | backend |
| Wave | 2 |
| Depends on | U1, U2, U3 |
| Owns | `server/src/modules/onboarding/{constants,ports,service,mappers,repository,routes}.ts`; `server/src/modules/index.ts`; `server/src/platform/container.ts`; `server/test/helpers/onboarding-fakes.ts`; `server/test/onboarding-tour-service.test.ts`, `server/test/onboarding-tour.it.test.ts` |
| Must not touch | U1–U3 files, `onboarding/types.ts`, `db/**`, `src/vendor/**` |
| Consumes | §3.1–§3.5 |
| Produces | §3.2 endpoints |
| Checks | `node scripts/agent-check.mjs server <owned files>` · depcruise |

**Steps**
1. `ports.ts`:
   - plain `TourRow`;
   - `OnboardingTourRepositoryPort { get(repoId); replace(row): Promise<boolean> }` (false on an FK violation, EC-17);
   - `RepoLookupPort` (as in conventions);
   - `TourGitPort { listTrackedFiles; readFileAt }` (structural);
   - `repoIntel: Pick<RepoIntel, 'getIndexState'|'getTopFilesByRank'|'getCriticalPaths'|'getRankedPaths'|'getImporterCounts'>`;
   - `llm`, `resolveModel`, `tokenizer`, `loadSystemPrompt`;
   - `excludedDirs`, `maxFileBytes`, `timeoutMs`, `now`.
2. `service.ts`:
   - `getState(ws, repoId)`: staleness = `tour && state row present && tour.tour_commit !== lastIndexedSha` (AC-67, EC-36).
   - `isGenerating`.
   - `generate(ws, repoId, log)` per the §3.2 check order:
     - tour commit = `lastIndexedSha` (AC-38);
     - candidates = top 40 ∪ chain files ∪ command sources, all non-excluded;
     - reads via `readFileAt(commit)`, skipping files where `!isReadableInput`, `excerptOf` is null or `containsSecretValue` (UT-7);
     - `fitToBudget` with `tokenizer.count`;
     - exactly one `completeStructured({ schema: TourDraft, maxTokens: 4000 })`;
     - then `groundTour`, `isEmptyTour` → 422, `getImporterCounts`;
     - `replace`, then return.
   - The timeout race uses `timeoutMs` (120 000) → 504. A late result is discarded. `inFlight` is released when the work settles.
   - One log line per outcome: repo id, commit, outcome, duration, kept/dropped per section, cost; never file text.
3. `mappers.ts`: row → `OnboardingTour | null`. It returns null when `tourCommit`/`model`/`durationMs` is null or `TourDocument.safeParse` fails (EC-19).
4. `repository.ts`: Drizzle upsert on `repo_id`; FK error → `false`.
5. `routes.ts`: the §3.2 routes; the route passes `req.log` as the logger port.
6. `container.ts`:
   - `onboardingTourService` getter;
   - overrides `onboardingRepo?` and `gitTree?`;
   - `excludedDirs = [...EXCLUDED_DIRS, ...config.projectDocsExcludedDirs]`;
   - `resolveModel` → feature `onboarding`;
   - `loadSystemPrompt` → `loadPromptTemplate('onboarding.system.md')`.
7. Register in `modules/index.ts`.

**Acceptance criteria**
- [ ] The POST body is the tour, and GET afterwards returns the same tour — SPEC-03 AC-31
- [ ] Two generations leave one row with the second content — AC-35
- [ ] A mock LLM sees `completeStructured` once per accepted generation, with `maxTokens: 4000` — AC-37, NFR-2
- [ ] Integration on a temp git clone indexed at A, with HEAD moved to B inside the stubbed LLM → stored commit A, prompt text from A — AC-38, EC-18
- [ ] Captured prompt: ≤ 20 excerpts, tree ≤ 300, counted tokens ≤ 20,000 — AC-39, AC-40, NFR-1 (wiring)
- [ ] With config `lib` excluded → `resources/lib/x.js` absent from the tree; without it → present — AC-42
- [ ] A settings override is used; with none → `openrouter` / `deepseek/deepseek-v4-flash` — AC-43
- [ ] `apiCostUsd: null` + `costUsd` set → cost stored null; model, duration and counters are stored — AC-54, NFR-11
- [ ] A fixture index with 3 importers → the stored `importer_count` is 3 — AC-27
- [ ] Tour at A, index advanced to B → `stale: true`, `current_commit` B; index at A → `false`; seeded repo without index state → `false` — AC-67, EC-36
- [ ] A resync and a refresh with a stored tour → LLM calls 0, tour unchanged — AC-69
- [ ] Without a clone → 422 `repo_not_cloned`, 0 calls — EC-4
- [ ] A blocking stub plus a second POST → 409 `generation_in_progress`, call count 1; GET shows `generating: true` meanwhile — EC-7
- [ ] A provider `ConfigError` → 422 `model_not_configured`, and the message names Settings → API keys and Settings → Models — EC-9
- [ ] A stub that throws → error response, previous tour intact — EC-10
- [ ] Fake timers at 120 s → 504 `generation_timeout`; a late result is not stored — EC-12, NFR-3
- [ ] An all-invented fixture → 422 `nothing_grounded`, tour unchanged — EC-14
- [ ] An empty repo → 422 `repo_empty`, 0 calls — EC-16
- [ ] Repo deleted during the blocking stub → no row — EC-17
- [ ] A legacy `{sections:[…]}` row → `tour: null` — EC-19
- [ ] No index row → 422 `repo_not_indexed`; `failed` and `degraded` → 422 `index_not_ready`; 0 calls each; `partial` → 200 — EC-34
- [ ] 20 GETs on the seeded dataset → p95 ≤ 500 ms — NFR-4
- [ ] The same mock output twice → equal tours apart from time, duration and cost — NFR-5
- [ ] Logger capture: one line with the required fields; a sentinel string from a fixture file is absent — NFR-6
- [ ] An app built with a non-test `nodeEnv`: the 11th POST in a minute → 429 — NFR-7
- [ ] A fixture symlink to a file outside the clone is never read or cited — UT-5
- [ ] Fixture `.env` (sentinel), a `ghp_` token file and a 500 KB file → all absent from the captured prompt — UT-6, UT-7, UT-12

### U6 — Tour page, data hook, navigation
| Field | Value |
|---|---|
| Kind | ui |
| Wave | 2 |
| Depends on | U4 |
| Owns | `client/src/lib/hooks/onboarding-tour.ts` (+ `.test.ts`); `client/src/app/repos/[repoId]/tour/page.tsx`; `client/src/app/repos/[repoId]/tour/_components/TourView/**` (`TourView.tsx`, `index.ts`, `hooks.ts`, `helpers.ts`, `styles.ts`, `_components/{TourHeader,TourToc,TourNotices}/**`, tests); `client/src/vendor/ui/nav.ts`; `client/src/components/app-shell/helpers.ts` + `helpers.test.ts` |
| Must not touch | `TourSections/**` (U4), `client/src/lib/api.ts`, `client/messages/**` |
| Consumes | §3.1, §3.2, §3.6; `TourSections`, `TOUR_SECTION_ORDER`, `useCopyToClipboard`; `useResyncRepoIntel` (`client/src/lib/hooks/repo-intel.ts:41`); `useActiveRepo`, `AppShell`, `relativeTime`, `formatCost` |
| Produces | route `/repos/:repoId/tour` |
| Checks | `node scripts/agent-check.mjs client <owned files>` |

**Steps**
1. Hook:
   - `useOnboardingTour(repoId)` → GET;
   - `useGenerateTour(repoId)` → POST; on success, merge into the cache (`tour`, `stale:false`, `current_commit = tour_commit`, `generating:false`); on 409, invalidate the GET.
2. `nav.ts`: add `{ key: 'onboarding-tour', label: 'Onboarding Tour', icon: 'Workflow', href: '/repos/:repoId/tour' }` between `pulls` and `context`.
3. `activeKeyFor`: match `/\/repos\/[^/]+\/tour(\/|$)/`; drop the `/onboarding` rule.
4. `TourView` (thin orchestration):
   - crumb `full_name › crumb`, heading with `name`;
   - states in this order:
     - loading skeleton (EC-25);
     - `!data` → error + Retry (EC-26; keep the data on a refetch error, EC-27);
     - `tour` → header + notices + sections + TOC + footer;
     - else not cloned (EC-1);
     - else not index-ready → reason + Re-analyze (EC-35);
     - else the AC-29 empty state.
5. `TourHeader`:
   - subtitle with `toLocaleString('en-US')` counts and `· indexed M` when the counts differ;
   - Regenerate / "Generating…" while the POST is pending or `generating` is set;
   - disabled with the hint without a clone (EC-2);
   - Share link → `${origin}/repos/${repoId}/tour#${activeKind}` + toast;
   - Copy as Markdown → `buildTourMarkdown` (helpers, the *Markdown export* order, diagram in a `mermaid` fence).
6. `TourNotices`: stale banner (sha7 → sha7) with Regenerate; 409 notice (EC-8); POST error message + Retry (EC-11).
7. `TourToc`:
   - `<nav aria-label>` list;
   - click → expand + `scrollIntoView` + `history.replaceState` hash;
   - scroll-spy via IntersectionObserver → `aria-current`;
   - hidden under 768 px (EC-21).
8. `hooks.ts`:
   - expanded state;
   - fragment on mount: a known kind → expand + scroll; unknown → nothing (EC-23).

**Acceptance criteria**
- [ ] Nav entry between Pull Requests and Project Context, href `/repos/<id>/tour`; `activeKeyFor('/onboarding') !== 'onboarding-tour'` and `activeKeyFor('/repos/x/tour') === 'onboarding-tour'` — SPEC-03 AC-1 (unit part), EC-24
- [ ] Breadcrumb "acme/payments-api › Onboarding Tour" and heading "Onboarding for payments-api" — AC-2
- [ ] An "On this page" landmark with 5 links in order; the highlighted link has `aria-current`, and stubbed intersection events move it — AC-4, AC-8, NFR-9
- [ ] Collapse section 3, click its link → expanded, `scrollIntoView` called, `location.hash === '#how_to_run'` — AC-6, AC-7
- [ ] Opening with `#first_tasks` → expanded and scrolled; `#nope` → no scroll, no error — AC-9, EC-23
- [ ] N=1201 → "Generated from 1,201 files · last refreshed 2h ago"; 1,201 vs 1,180 → "· indexed 1,180"; equal → absent — AC-10, AC-11
- [ ] Empty state title, body and action text match AC-29; a click → exactly one POST — AC-29, AC-30
- [ ] Pending POST → "Generating…", no enabled action, stored tour still visible; GET `generating:true` → same — AC-32, AC-34
- [ ] POST resolves → new content without reload — AC-36
- [ ] Footer "deepseek/deepseek-v4-flash · — · 41 s · 3 items dropped as unverified" — AC-55
- [ ] Share link → clipboard `<origin>/repos/<id>/tour#<kind>` + the toast text; Copy as Markdown → clipboard equals the expected export with a `mermaid` fence — AC-63, AC-64
- [ ] Stale fixture → the banner text with both sha7; Regenerate sends one POST — AC-68
- [ ] No clone and no tour → "Repository not cloned" + body, no Generate; no clone with a tour → Regenerate disabled + hint — EC-1, EC-2 (unit part)
- [ ] 409 → the in-progress notice; POST failure → message + Retry above the tour, or in place of the empty state — EC-8, EC-11
- [ ] Three not-ready fixtures → the three reason texts; Re-analyze → one `POST /repos/:id/resync` — EC-35
- [ ] Pending first fetch → skeleton; 500 → "Couldn’t load the onboarding tour" + Retry; 200 then refetch 500 → tour still visible — EC-25, EC-26, EC-27
- [ ] The Share button's accessible name names its target; no literal UI strings — NFR-8, NFR-10

### U7 — Seeded tour for `acme/payments-api`
| Field | Value |
|---|---|
| Kind | backend |
| Wave | 1 |
| Depends on | Wave 0 |
| Owns | `server/src/db/seed.ts`; `server/test/seed-onboarding-tour.it.test.ts` |
| Must not touch | migrations, schema, `modules/**` |
| Consumes | §3.3 columns, §3.4 `TourDocument` (type, `satisfies`) |
| Produces | the seeded tour row |
| Checks | `node scripts/agent-check.mjs server <owned files>` |

**Steps**
1. After the demo repo block (`seed.ts:266-280`), insert one `onboarding` row only when none exists for the repo (insert-once).
2. Content mirrors frames 7–9 and `screen_tour_context.jsx:3-14`:
   - an overview with path spans;
   - the frame graph as `flowchart LR` Mermaid;
   - 4 critical paths, 4 steps with sources, 3 reading entries;
   - 3 tasks (one is a new file);
   - counters with 3 dropped;
   - model `deepseek/deepseek-v4-flash`, cost `null`, duration 41 000 ms, a fixed `tour_commit`.
3. No index state for the repo (EC-36).

**Acceptance criteria**
- [ ] `seed()` twice → one row; `TourDocument.parse(json)` succeeds; `diagram` non-null; `tour_commit` set — SPEC-03 *Data and state (Seed)*, supports EC-2, EC-3, EC-36

### U8 — e2e flow on the seeded tour
| Field | Value |
|---|---|
| Kind | e2e (→ `implementer`) |
| Wave | 3 |
| Depends on | U5, U6, U7 |
| Owns | `e2e/specs/16-onboarding-tour.flow.json`; `e2e/README.md` (coverage row); `e2e/specs/flows.md` (only if it lists flows) |
| Must not touch | other flows, `e2e/run.ts` |
| Consumes | seeded stack |
| Produces | flow 16 |
| Checks | `node scripts/agent-check.mjs e2e <owned files>` (the hermetic run is in `plan-verifier`) |

**Steps**
1. Steps:
   - `open {BASE}/` → `wait --url /pulls`;
   - `find text "Onboarding Tour" click` → `wait --url /tour`;
   - `wait --text "Onboarding for payments-api"`;
   - `wait --text "Architecture overview"` and one seeded critical path;
   - `wait --text "Clone the repository to regenerate"`.
2. If agent-browser has a deterministic negative or `is enabled` check, also assert that no "Open" button exists and that Regenerate is disabled. Otherwise the RTL tests in U4/U6 carry those halves.

**Acceptance criteria**
- [ ] The flow passes on the hermetic stack: the nav entry opens `/repos/<id>/tour` and shows the heading — SPEC-03 AC-1
- [ ] The seeded tour is visible with the clone hint (Regenerate unavailable); paths render without Open — EC-2, EC-3

## 5. Waves (execution order)
| Wave | Units | Runs | Why this order |
|---|---|---|---|
| 0 | orchestrator: §3.1 in both vendored copies (+ `server/test/contracts.test.ts` swapped to parse `OnboardingTour`), §3.3 schema + `pnpm db:generate --name onboarding_tour`, §3.4 `modules/onboarding/types.ts`, §3.6 `client/messages/en/onboarding.json` | sequential | contracts, migration, serialized files |
| 1 | U1, U2, U3, U4, U7 | parallel | disjoint files; each needs only Wave 0 |
| 2 | U5, U6 | parallel | U5 needs U1–U3; U6 needs U4; disjoint packages |
| 3 | U8 | sequential | needs the API, the page and the seed |

Serialized files:
- `modules/index.ts`, `container.ts` → U5 only.
- `vendor/ui/nav.ts` → U6 only.
- `vendor/shared/**`, messages, migration → Wave 0 only.
- `client/src/lib/api.ts` is not touched.

## 6. Test plan
- **server unit** (no DB):
  - `onboarding-grounding`, `onboarding-commands` (U1);
  - `onboarding-input`, `onboarding-prompt` (U2);
  - `git-tree` (U3, a real temp git repo, no DB);
  - `onboarding-tour-service` (U5, fakes in `helpers/onboarding-fakes.ts`, `MockAuthProvider`, fake timers for EC-12);
  - `contracts` (Wave 0).
- **server integration** `*.it.test.ts`:
  - `repo-intel-importers` (U3);
  - `onboarding-tour` (U5): DB + temp clone; seeded repo for EC-36 and NFR-4; non-test `nodeEnv` app for NFR-7;
  - `seed-onboarding-tour` (U7).
- **client** (vitest + jsdom, mocked `fetch`, `fireEvent`, mocked `mermaid` module and clipboard):
  - `TourSections/**/*.test.tsx` (U4);
  - `TourView/**/*.test.tsx`, `lib/hooks/onboarding-tour.test.ts`, `app-shell/helpers.test.ts` (U6).
- **e2e:** `16-onboarding-tour.flow.json` (U8).
- **manual** (by the orchestrator before the user OK):
  - AC-8 scroll-spy and EC-21 at 700 px in a browser;
  - the seeded diagram visible (AC-65);
  - UT-10 hostile Mermaid (`click A call alert()`, `<img onerror>`): no alert;
  - NFR-3: a real model on `support-platform-fork`, record the duration.

## 7. Verification (orchestrator, after merge)
```bash
cd server && pnpm db:migrate && pnpm typecheck && pnpm test && pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known
cd client && pnpm typecheck && pnpm test
cd e2e && npm run typecheck && npm run e2e:hermetic
```
Then `plan-verifier scope=all`, the review rounds, `spec-creator implemented SPEC-03`, and `/pr-self-review`.

## 8. Risks
- **Vendored contract drift.** Wave 0 edits both `knowledge.ts` and `index.ts` copies plus the new file. pr-self-review DET-003 will flag `src/vendor/shared`: run `accept` with the reason "SPEC-03 tour contract, identical in both copies". Diff the two new files byte-for-byte.
- **Migration.** `0017` must be the next number (`0016_project_context.sql` is the last). It must be generated by drizzle-kit, not hand-written, and `meta/_journal.json` must change only in Wave 0.
- **Depcruise.** The risky edges:
  - onboarding → repo-intel internals: only `types.ts` is allowed (re-exports);
  - `ports.ts` → adapters: use structural types;
  - the adapter → modules: `GitTreeReader` returns a plain shape.
  The baseline must not grow.
- **Security-sensitive paths.**
  - Grounding (UT-4/5), secret filtering (UT-6/7/8) and prompt wrapping (UT-1/3) are new attack surface; the security reviewer is mandatory.
  - reviewer-core is untouched.
  - Mermaid relies on the existing strict renderer; client INSIGHTS: `innerHTML` of mermaid's SVG at `securityLevel:'strict'`.
- **Double error surface.** The global `MutationCache` toasts every mutation error (`client/src/lib/providers.tsx:41-43`), on top of the inline EC-8/EC-11 notices. This is accepted; do not suppress the global toast in this feature.
- **e2e literal strings.** The flow asserts copy from `onboarding.json`, so a later copy change breaks flow 16 (client INSIGHTS 2026-09-23). The negative assertions depend on agent-browser support (U8 step 2).
- **Timeout leak.** The underlying LLM promise keeps running after the 504. The tests must assert that no row is written after the timeout fires.
- **Windows paths.** All tree paths must be POSIX (server INSIGHTS 2026-09-29), so `ls-tree` output is used as-is and never `path.join`ed into a repo path.

## 9. Out of scope
- Background generation, per-file staleness, a degraded tour, a structured diagram, an MCP tool, history (SPEC-03 Non-goals).
- Rewording the existing `/onboarding` wizard.
- Server README / API-map docs (`doc-writer` on demand).

### Spec follow-ups (owner: user / spec author)
none
