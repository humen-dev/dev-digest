# Blast Radius: per-handler endpoint and cron attribution — development plan

| Field | Value |
|---|---|
| Status | draft |
| Goal | A Blast Radius card lists, under each changed symbol, only the endpoints and cron jobs whose handler reaches that symbol. When the handler is unknown, the card falls back to today's per-file lists. |
| Packages touched | server · client · shared (vendored `review-api.ts`, both copies) |

Branch: `feat/repo-intel-python` (HEAD `8bdfb83`, on top of L04, not pushed).

## 1. Context

**Today, attribution is per caller file.**
- The indexer stores the endpoints and crons of a whole file in `file_facts` as two jsonb string arrays (`server/src/db/schema/repo-intel.ts:75-88`, `server/src/db/migrations/0004_needy_grey_gargoyle.sql:8-14`).
- The persistent blast read loads them per caller file into `BlastResult.factsByFile` (`server/src/modules/repo-intel/service.ts:377-390`; type at `server/src/modules/repo-intel/types.ts:84`).
- The pure mapper unions `factsByFile[f]` over every kept caller file of a changed symbol (`server/src/modules/blast/domain/build-blast-radius.ts:38-44`).
- `server/INSIGHTS.md:24` (2026-09-29, Codebase Patterns) records this as expected behaviour and says a real fix "needs repo-intel to store which enclosing symbol registers each route". This plan does that. The orchestrator appends a superseding INSIGHTS entry after the last wave (§7).

**Where handler knowledge is lost today.**
- *TS/JS:* `extractEndpoints` / `extractCrons` are per-line regexes that keep only `"METHOD /path"` or the cron expression. The rest of the line, including the handler argument, is thrown away (`server/src/adapters/codeindex/extract.ts:182-214`). `parseSourceFile` passes only those strings on (`server/src/modules/repo-intel/pipeline/parse-file.ts:44-49`). The pipelines buffer `{ filePath, endpoints, crons }` (`pipeline/full.ts:180-183`, `pipeline/incremental.ts:191-192`) into `IndexerFileFactsRow` (`server/src/modules/repo-intel/repository.ts:99-103`). That row is written by `replaceFileFacts` / `patchFileFacts` (`repository.ts:371-384`, `:596-617`) and read by `getFileFacts` (`:534-549`).
- *Python:* `attributePythonFacts` already resolves each route, viewset and cron target to a `PyResolved { file, name }` (`server/src/adapters/python/facts.ts:641-645`; resolver at `server/src/adapters/python/project.ts:73-91`). It then keeps only the fact string. The fact is added both to the registering file and to the handler's file (`facts.ts:653-660`). DRF `@action` methods lose their method name, because `PyViewAction` has only `urlPath/detail/methods` (`server/src/adapters/python/types.ts:223-229`, built in `facts.ts:546-562`). Celery `@shared_task` jobs are plain strings with no target (`facts.ts:499-501`). `PyFactsRow` is `{ filePath, endpoints, crons }` (`types.ts:242-248`).

**Caller shape.** A `BlastCallerRow` carries `file`, `symbol` (a display label), `viaSymbol`, `line` and `rank` (`types.ts:63-72`).
- In the persistent path, `symbol` is the nearest preceding non-dotted symbol, and the end line is not checked (`service.ts:744-749`). It falls back to the file's basename (`service.ts:358-361`).
- Symbol rows do carry real ranges. TS gets `endLine` from ast-grep for functions, classes, methods and const-arrow declarators (`server/src/adapters/astgrep/index.ts:226-337`). Python dual-emits `Class.method` and bare `method` with `endLine` (`server/src/adapters/python/symbols.ts:61-66`, `types.ts:131-136`).

**Observed defects (the user's reports).**
- *humen-dev/contact-book PR #29 (Django).* `apps/contacts/views.py` declares `contacts` (def) and `ContactsViewSet` (DRF viewset). Both are referenced only from `apps/contacts/urls.py` (`path("", views.contacts)` and `router.register(r"contacts", views.ContactsViewSet)`). Both cards show all 6 endpoints of that file. Correct result: `contacts` → `ANY /`; `ContactsViewSet` → the other 5.
- *humen-dev/blast-radius-demo PR #1 (Express).* Verified sources:
  - `src/routes/invoices.ts` holds `createInvoice` (calls `formatMoney`), `previewTax` (calls `roundCents`), `router.post('/api/invoices', createInvoice);` and `router.get('/api/invoices/tax', previewTax);`.
  - `src/routes/orders.ts` holds `listOrders` and `getOrder` (both call `formatMoney`, `listOrders` inside an inline `.map` arrow), `router.get('/api/orders', listOrders);` and `router.get('/api/orders/:id', getOrder);`.
  - `src/jobs/nightly-report.ts` holds `runNightlyReport` (calls both helpers), and `startNightlyReport` contains `cron.schedule('0 2 * * *', runNightlyReport);`.
  - Sources: https://raw.githubusercontent.com/humen-dev/blast-radius-demo/main/src/routes/invoices.ts, …/src/routes/orders.ts, …/src/jobs/nightly-report.ts, …/src/lib/money.ts.
  - Today `formatMoney` wrongly lists `GET /api/invoices/tax`.

**Consumers of the response.**
- The client graph draws caller → endpoint edges only from `caller_file_facts[caller.file]` (`client/src/app/repos/[repoId]/pulls/[number]/_components/BlastRadius/_components/BlastGraph/helpers.ts:98-113`). It would stay file-level, and so disagree with the fixed cards, unless it gets per-caller data.
- The MCP adapter parses the response with a non-strict `z.object` (`mcp/src/api/schemas.ts:177`), so new optional fields are stripped. `format/blast.ts` reads only the per-group lists (`mcp/src/format/blast.ts:32-45`). MCP needs no change.
- The indirect walk reads raw `file_facts` of hop ≥ 2 files and removes each group's direct lists (`server/src/modules/blast/domain/indirect-impact.ts:53-58`).

### Decisions
1. **A handler is a symbol name in canonical form.** It is either a bare `name` (function, class or Celery task) or `Class.method` (a DRF `@action` only). Module prefixes such as `views.contacts` are resolved away by the Python resolver, so `contacts` is stored. `head(h)` is the text before the first `.`, for example `ContactsViewSet.export` → `ContactsViewSet`. *Rejected:* storing `(file, name)` pairs. The caller file already scopes the lookup, and `BlastCallerRow` and the changed symbols are keyed by name.
2. **Storage: two new jsonb columns on `file_facts`, `endpoint_handlers` and `cron_handlers`, in a new migration `0015_file_facts_handlers.sql`.** Each is `NOT NULL DEFAULT '{}'` and shaped `{ "<fact string>": ["<handler>", …] }`. The user preferred no migration, but none of the no-migration options is compatible:
   - Changing the element shape of `endpoints`/`crons` to objects, or mixing strings and objects, breaks every reader typed `string[]`. That includes `repository.ts:544-548`, the blast repository used by the indirect walk (`server/src/modules/blast/repository.ts:35`), and the tests that insert rows directly (`server/test/blast.it.test.ts:86`).
   - Rows written before the reindex would also have to be read as two shapes.
   - An `ADD COLUMN … jsonb DEFAULT '{}'` with a constant default is a metadata-only change on PG ≥ 11 (no table rewrite). Old rows read as "no handler known", which gives exactly today's behaviour.
   - No index is added. The columns are only read by primary key `(repo_id, file_path)`.
3. **A fact whose handler is unknown stays file-level.** A fact has a known handler only if every registration of it in that file produced one. If any registration did not, the key is omitted. An absent key is the only "unknown" encoding.
4. **The attribution rule** (exact code in §3.4) is applied separately to endpoints and to crons, for each changed symbol `S` and each caller `c` in file `F`:
   - Unknown-handler facts of `F` are always kept.
   - *direct:* facts whose handler is `S`, or whose handler head is `S`, are kept. The route points straight at the changed symbol, as in Django `urls.py`.
   - *own:* if `c` sits inside a handler of `F`, meaning some handler `h` has `h` or `head(h)` in `c`'s enclosing scopes, only those handlers' facts are added. This is the TS case: `createInvoice` calls `formatMoney` and is the handler of `POST /api/invoices`.
   - *fallback:* if `c` is not inside any handler of `F` and there is no direct fact, all of `F`'s facts are kept. `c` is then a helper or module-level code, and without an intra-file call graph we cannot tell which handlers reach it. This is the "at worst file-level" guarantee.
5. **Caller scopes come from symbol ranges.** The repo-intel facade adds `scopes` to each persistent `BlastCallerRow`: every symbol of the caller file (dotted and bare) whose `[line, endLine]` contains the reference line. The `symbol` display label is not changed (see §9).
6. **TS/JS: only a trailing plain-identifier handler is captured.** The last argument of the registration call must be an identifier, and the call must close on the same line: `router.get('/x', listOrders);`, `router.post('/x', auth, createInvoice)`, `cron.schedule('0 2 * * *', runNightlyReport);`, `jobs.register('poll_repo', handler)`. A `{ method, url, handler: name }` route object counts when `handler:` is on the same line. Inline arrows, member expressions (`ctrl.list`), wrapped handlers (`wrap(h)`) and multi-line calls are **unknown**. *Rejected:* using the enclosing function of the registration line as the handler for inline arrows.
   - That enclosing function is usually a registrar such as `ordersRoutes(app)`, not the code that calls the changed symbol.
   - Every route in the registrar would get the same handler, which is at best file-level again.
   - Worse, any caller inside the registrar would be seen as a handler. That turns off the helper fallback of Decision 4 and can drop endpoints that are shown today.
7. **DRF viewsets are attributed at class level.** A reference anywhere inside `class X` matches both `X` (base routes) and `X.m` (action routes), because `head(X.m) = X` is in scope. DRF sends every route through shared class machinery (`get_queryset`, serializers, permissions), so method-level attribution would be wrong more often than right. It is still a strict improvement over file-level.
8. **Indirect impact stays file-level.** Files at hops 2..`bfs_depth` are importers. We cannot know which of their handlers reach the change without a symbol-level import graph. `attributeIndirect` and the blast repository are not changed.
9. **Unattributed endpoints and stats follow the filtered sets.** An endpoint that handler attribution rules out for every caller row of every file that holds it is dropped. It no longer goes into `unattributed_endpoints`. An endpoint of a file whose caller rows were cut by the caller cap stays unattributed, as today. `stats.endpoints` and `stats.crons` keep their formulas over the new sets.
10. **Contract change: an additive optional `BlastRadiusResponse.caller_facts`** (per kept caller `name` + `file`). `caller_file_facts` keeps its raw per-file meaning. The client graph prefers `caller_facts` and falls back to `caller_file_facts`. *Rejected:* adding fields to `BlastCaller`. It lives in `brief.ts` (`server/src/vendor/shared/contracts/brief.ts:24-28`) and is shared with the PR brief contract.
11. **`INDEXER_VERSION` 4 → 5 in the last wave (U6).** The bump forces a full reindex (`server/src/modules/repo-intel/constants.ts:54-65`). Doing it last means it happens only once every writer and reader is in. U6 also owns the test that pins the value (`server/test/repo-intel-python.it.test.ts:71`).
12. **The degraded (ripgrep) path is unchanged.** It has no `factsByFile`, so every endpoint stays unattributed (`service.ts:229-304`).

### Open questions
none

## 2. Affected modules
| Package | Touched? | Why / what changes | Architecture rule that applies |
|---|---|---|---|
| server | yes | Adapters capture handlers (`adapters/codeindex/extract.ts`, `adapters/python/*`). The repo-intel pipeline and repository persist them. The facade adds caller `scopes`. The blast domain mapper filters per group and emits `caller_facts`. New migration `0015`. | onion: adapters = ring 3; `repo-intel/repository.ts` + new `mappers.ts` = ring 3; `repo-intel/domain/caller-scopes.ts` and `blast/domain/handler-attribution.ts` = ring 1 (pure); `service.ts` = ring 2. No route changes. |
| client | yes | `BlastGraph/helpers.ts` builds caller → endpoint edges from `caller_facts` when present. | frontend-ui-architecture: pure helper in the component folder; no new hooks or strings |
| reviewer-core | no | — | grounding gate and `INJECTION_GUARD` untouched |
| e2e | no | Blast flows run on the seeded or degraded path; no flow asserts per-symbol endpoints | — |
| mcp | no | The non-strict parse strips `caller_facts` (`mcp/src/api/schemas.ts:177`) | — |
| shared (vendored) | yes | Additive `BlastCallerFacts` + `caller_facts` in `contracts/review-api.ts`, identical in `server/src/vendor/shared` and `client/src/vendor/shared` | Wave 0 only |

## 3. Contracts

### 3.1 Shared contract (Wave 0, both copies, insert right after `BlastFileFacts` and extend `BlastRadiusResponse`)
```ts
/** One kept caller's file facts after handler attribution (docs/plans/blast-endpoint-attribution.md). */
export const BlastCallerFacts = z.object({
  name: z.string(),
  file: z.string(),
  endpoints: z.array(z.string()),
  crons: z.array(z.string()),
});
export type BlastCallerFacts = z.infer<typeof BlastCallerFacts>;

// inside BlastRadiusResponse = BlastRadius.extend({ … }), after caller_file_facts:
  /** Per kept caller (name + file), sorted by file then name: the union, over the downstream groups the
   *  caller appears in, of its file's facts kept by handler attribution. Graph edges prefer this. */
  caller_facts: z.array(BlastCallerFacts).optional(),
```
`caller_file_facts` is unchanged: it holds the raw facts of each kept caller file.

### 3.2 DB (Wave 0)
`server/src/db/schema/repo-intel.ts`, in `fileFacts`, after `crons`:
```ts
endpointHandlers: jsonb('endpoint_handlers').$type<Record<string, string[]>>().notNull().default({}),
cronHandlers: jsonb('cron_handlers').$type<Record<string, string[]>>().notNull().default({}),
```
Generated with `cd server && pnpm db:generate --name file_facts_handlers`. The expected SQL, and the only migration in this plan:
```sql
-- server/src/db/migrations/0015_file_facts_handlers.sql
ALTER TABLE "file_facts" ADD COLUMN "endpoint_handlers" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "file_facts" ADD COLUMN "cron_handlers" jsonb DEFAULT '{}'::jsonb NOT NULL;
```
Also generated: `meta/0015_snapshot.json` and the `meta/_journal.json` entry. No index (reads are by primary key).

### 3.3 Server-internal types (Wave 0, type-only, all new fields optional so the tree stays green)
`server/src/modules/repo-intel/types.ts`:
```ts
/** fact string → sorted, unique handler names (bare `name` or `Class.method`). A fact with no key = handler unknown. */
export type FactHandlers = Record<string, string[]>;

export interface BlastCallerFileFacts {
  endpoints: string[];
  crons: string[];
  endpointHandlers?: FactHandlers;
  cronHandlers?: FactHandlers;
}

export interface BlastCallerRow {
  // …existing fields unchanged…
  /** Names (dotted and bare) of every symbol in `file` whose [line, endLine] contains `line`; sorted.
   *  Absent on the degraded path — consumers then use [symbol]. */
  scopes?: string[];
}

export interface BlastResult {
  // …existing fields unchanged, except:
  factsByFile?: Record<string, BlastCallerFileFacts>;
}
```
`server/src/modules/repo-intel/repository.ts`:
```ts
export interface IndexerFileFactsRow {
  filePath: string;
  endpoints: string[];
  crons: string[];
  /** Absent or {} = every fact's handler unknown. */
  endpointHandlers?: FactHandlers;
  cronHandlers?: FactHandlers;
}
```
(`FactHandlers` is imported from `./types.js`, which `repository.ts` already imports from, at `:20`.)

### 3.4 Unit-to-unit function contracts (produced in Wave 1; each lives in exactly one unit)

**U1: `server/src/adapters/codeindex/extract.ts`**
```ts
export interface ExtractedFact { fact: string; handler: string | null }
export function extractEndpointFacts(content: string): ExtractedFact[];   // one item per match, source order
export function extractCronFacts(content: string): ExtractedFact[];
/** Folds items into sorted unique facts + handler map; a fact with ANY null-handler item gets no key. */
export function foldFactHandlers(items: readonly ExtractedFact[]): { facts: string[]; handlers: Record<string, string[]> };
// unchanged signatures and output (now thin wrappers):
export function extractEndpoints(content: string): string[];
export function extractCrons(content: string): string[];
```
`ParsedSourceFile` (`pipeline/parse-file.ts`) gains `endpointHandlers: Record<string, string[]>` and `cronHandlers: Record<string, string[]>`. `.py` files return `{}` for both.

**U2: `server/src/adapters/python/types.ts`.** `PyFactsRow` becomes:
```ts
export interface PyFactsRow {
  filePath: string;
  endpoints: string[];               // sorted, unique (unchanged)
  crons: string[];                   // sorted, unique (unchanged)
  endpointHandlers: Record<string, string[]>;
  cronHandlers: Record<string, string[]>;
}
```
`PyFactsRow` must stay structurally assignable to `IndexerFileFactsRow`. The pipeline assigns `py.facts` to `IndexerFileFactsRow[]` (`pipeline/full.ts:236`, `pipeline/incremental.ts:250`).

**U3: `server/src/modules/repo-intel/domain/caller-scopes.ts`**
```ts
export interface ScopeSymbol { name: string; line: number | null; endLine: number | null }
/** Sorted unique names of symbols with line <= refLine <= endLine. A symbol whose endLine is null
 *  counts only when its name === enclosing (the existing nearest-preceding label). */
export function callerScopes(rows: readonly ScopeSymbol[], refLine: number, enclosing: string | null): string[];
```
**U3: `server/src/modules/repo-intel/mappers.ts`**
```ts
/** Tolerant jsonb → FactHandlers: keeps only own keys present in `facts`, values filtered to strings,
 *  deduped + sorted, empty lists dropped; anything malformed → {} (zod safeParse). */
export function parseFactHandlers(value: unknown, facts: readonly string[]): FactHandlers;
```

**U4: `server/src/modules/blast/domain/handler-attribution.ts`**
```ts
export interface AttributionCaller { symbol: string; scopes?: string[] }
export function handlerHead(h: string): string; // text before the first '.', or h
/** Facts of one file kept for changed symbol `changed` reached through `caller`. Sorted, unique. */
export function attributeFacts(
  facts: readonly string[],
  handlers: FactHandlers | undefined,
  changed: string,
  caller: AttributionCaller,
): string[];
```
Exact semantics, which U4 implements and which are binding for U5 and U6 expectations:
```
scopes          = new Set(caller.scopes ?? [caller.symbol])
known(E)        = handlers !== undefined && Object.hasOwn(handlers, E) && handlers[E].length > 0
matchesS(h)     = h === changed || handlerHead(h) === changed
matchesScope(h) = scopes.has(h) || scopes.has(handlerHead(h))
unknown         = facts.filter(E => !known(E))
direct          = facts.filter(E => known(E) && handlers[E].some(matchesS))
ownSet          = facts.filter(E => known(E) && handlers[E].some(matchesScope))
own             = ownSet.length > 0 ? ownSet : (direct.length > 0 ? [] : facts.filter(known))
return sortedUnique([...unknown, ...direct, ...own])
```
`handlers` undefined or `{}` → every fact is returned (today's behaviour).

**U4: mapper output (`build-blast-radius.ts`).** For each downstream group of `S` and each kept caller `r`, with `fx = factsByFile[r.file]`:
- the endpoints kept are `attributeFacts(fx.endpoints, fx.endpointHandlers, S, r)`;
- the crons kept are `attributeFacts(fx.crons, fx.cronHandlers, S, r)`.

The outputs are then built as follows:
- `endpoints_affected` / `crons_affected` = the union over the kept callers of the group.
- `caller_facts` = one entry per distinct `(r.symbol, r.file)` across `downstream` whose file has facts. Its lists are the union over groups, and entries are sorted by file, then name.
- `unattributed_endpoints` = `sortedUnique(impactedEndpoints)` minus the attributed endpoints, minus the *refuted* ones:
  - `reachable` = the union of `attributeFacts` over **every** grouped caller row, taken before the per-symbol cap;
  - `withCallers` = the files of those rows;
  - `refuted(E)` = `factsByFile` is present, `E` is not in `reachable`, and every file of `factsByFile` whose endpoints contain `E` is in `withCallers`.
- `stats`, `caller_file_facts`, `indirect` defaults and `limits` keep their current formulas.

No HTTP endpoint is added or changed. `GET /pulls/:id/blast` returns the extended `BlastRadiusResponse`.

## 4. Work units

### U0 — Contracts, schema + migration, internal types (orchestrator)
| Field | Value |
|---|---|
| Kind | backend |
| Wave | 0 |
| Depends on | none |
| Owns (create/modify) | `server/src/vendor/shared/contracts/review-api.ts`, `client/src/vendor/shared/contracts/review-api.ts`, `server/test/contracts.test.ts`, `server/src/db/schema/repo-intel.ts`, `server/src/db/migrations/0015_file_facts_handlers.sql` (generated), `server/src/db/migrations/meta/0015_snapshot.json` (generated), `server/src/db/migrations/meta/_journal.json`, `server/src/modules/repo-intel/types.ts`, `server/src/modules/repo-intel/repository.ts` (**only** the `IndexerFileFactsRow` interface and the `FactHandlers` import) |
| Must not touch | any applied migration `0000`–`0014`; other vendored blocks; `brief.ts` |
| Consumes | none |
| Produces | §3.1, §3.2, §3.3 |
| Checks | `server: pnpm typecheck · pnpm exec vitest run test/contracts.test.ts · pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known` · `client: pnpm typecheck` |

**Steps**
1. Add `BlastCallerFacts` and `caller_facts` (§3.1) to the server copy of `review-api.ts`, then paste the same block into the client copy. Diff the two blocks: they must match byte for byte.
2. Extend `contracts.test.ts:203` (or add a sibling case). `BlastRadiusResponse` must parse without `caller_facts`, parse with `caller_facts: [{ name: 'createInvoice', file: 'src/routes/invoices.ts', endpoints: ['POST /api/invoices'], crons: [] }]`, and reject `caller_facts: [{ name: 'x' }]`.
3. Add the two columns (§3.2), then run `pnpm db:generate --name file_facts_handlers`. Check that the SQL is exactly the two `ADD COLUMN` statements, and run `pnpm db:migrate` on the dev DB.
4. Add the §3.3 types. Nothing else in `repository.ts` changes in this wave.

**Acceptance criteria**
- [ ] Both vendored copies contain identical `BlastCallerFacts` / `caller_facts` text; the contracts test passes.
- [ ] `0015_file_facts_handlers.sql` holds only the two additive `ALTER TABLE … ADD COLUMN … DEFAULT '{}'::jsonb NOT NULL`, and `pnpm db:migrate` applies it.
- [ ] Server and client typecheck green; depcruise baseline unchanged.

### U1 — TS/JS handler capture + pipeline plumbing
| Field | Value |
|---|---|
| Kind | backend |
| Wave | 1 |
| Depends on | U0 |
| Owns (create/modify) | `server/src/adapters/codeindex/extract.ts`, `server/test/extract.test.ts`, `server/src/modules/repo-intel/pipeline/parse-file.ts`, `server/src/modules/repo-intel/pipeline/full.ts`, `server/src/modules/repo-intel/pipeline/incremental.ts`, `server/test/indexer-pipeline.test.ts`, `server/test/parse-file.test.ts` (new) |
| Must not touch | `repository.ts`, `service.ts`, `constants.ts` (U3/U6), `adapters/python/**` (U2) |
| Consumes | `IndexerFileFactsRow` (§3.3) |
| Produces | `ExtractedFact`, `extractEndpointFacts`, `extractCronFacts`, `foldFactHandlers`; `ParsedSourceFile.endpointHandlers/cronHandlers` (§3.4) |
| Checks | `server: pnpm typecheck · pnpm exec vitest run test/extract.test.ts test/parse-file.test.ts test/indexer-pipeline.test.ts · depcruise --ignore-known` |

**Steps**
1. In `extract.ts`, add `extractEndpointFacts` / `extractCronFacts`.
   - Reuse the existing `verbRe`, `routeObjRe`, `cronExprRe` and `jobKindRe`, and emit items in the same line order.
   - To find the handler, take the rest of the raw line after the matched literal, with any trailing `//` comment stripped. Apply `/,\s*([A-Za-z_$][\w$]*)\s*\)\s*;?\s*$/` to it.
   - For `routeObjRe`, also accept `/\bhandler\s*:\s*([A-Za-z_$][\w$]*)\s*[,}]/` on the same line.
   - Reject `KEYWORDS` and `true|false|null|undefined|this` (the handler becomes `null`).
   - `job:` facts use the same tail rule.
2. Re-implement `extractEndpoints` / `extractCrons` as `[...new Set(items.map(i => i.fact))]`. The output must be identical to today's, including order: the existing tests at `test/extract.test.ts:80-102` pass unchanged.
3. Add `foldFactHandlers`, following §3.4. A fact that has a `null` item anywhere gets no key.
4. In `parseSourceFile`, return `endpointHandlers` / `cronHandlers` from the fold (`{}` for `.py`). In `full.ts` and `incremental.ts`, push them into `factsBuf` next to `endpoints` / `crons`. The Python rows already flow through `pyFactRows` unchanged.
5. Update the stub repository in `indexer-pipeline.test.ts` to the widened row type. Add one assertion that a TS file's facts row carries `endpointHandlers`.

**Acceptance criteria**
- [ ] `router.get('/api/orders', listOrders);` → `{ fact: 'GET /api/orders', handler: 'listOrders' }`; `router.post('/x', auth, createInvoice)` → handler `createInvoice`; `cron.schedule('0 2 * * *', runNightlyReport);` → `{ fact: '0 2 * * *', handler: 'runNightlyReport' }`; `jobs.register('poll_repo', handler)` → `job:poll_repo` / `handler`.
- [ ] `app.get('/x', async (req) => {…` and `app.get('/x', wrap(h))` and `app.get('/x', ctrl.list)` and a multi-line call → handler `null`.
- [ ] `foldFactHandlers([{fact:'GET /a',handler:'x'},{fact:'GET /a',handler:null}])` → `{ facts: ['GET /a'], handlers: {} }`. A fact registered twice with `x` and `y` → `['x','y']`.
- [ ] A test with the whole blast-radius-demo `invoices.ts` text from §1 gives `parseSourceFile(...).endpointHandlers` = `{ 'POST /api/invoices': ['createInvoice'], 'GET /api/invoices/tax': ['previewTax'] }`.
- [ ] Existing extract and pipeline tests still pass.

### U2 — Python handler capture
| Field | Value |
|---|---|
| Kind | backend |
| Wave | 1 |
| Depends on | U0 |
| Owns (create/modify) | `server/src/adapters/python/facts.ts`, `server/src/adapters/python/types.ts`, `server/test/python-facts.test.ts`, `server/test/python-project.test.ts` |
| Must not touch | `adapters/python/project.ts`, `imports.ts` and `scan.ts` (their resolution behaviour stays as is); the pipeline (U1) |
| Consumes | none (the pipeline picks up the output structurally) |
| Produces | `PyFactsRow.endpointHandlers/cronHandlers` (§3.4) |
| Checks | `server: pnpm typecheck · pnpm exec vitest run test/python-facts.test.ts test/python-project.test.ts test/python-*.test.ts · depcruise --ignore-known` |

**Steps**
1. `types.ts`:
   - `PyViewAction` gains `name: string` (the method name).
   - `PyFileRegistrations.jobs` becomes `Array<{ fact: string; handler: string }>`, with the fact still `job:<label>`.
   - `PyFactsRow` changes as in §3.4.
2. `facts.ts`:
   - `actionsOf` sets `name: m.name`. The `shared_task` / `.task` branch records `{ fact: 'job:' + label, handler: fn.name }`.
   - In `attributePythonFacts`, track per file `Map<fact, Set<string> | null>` for endpoints and for crons, where `null` means poisoned (unknown).
   - `addEndpoint` / `addCron` take a `handler: string | null` and record it on **both** rows they write: the registering file and the resolved file.
3. Handler derivation. Here `ident(n)` means `n` if it matches `/^[A-Za-z_][A-Za-z0-9_]*$/`, else `null`, and the handler is `null` when resolution fails.
   - Django/Flask/FastAPI endpoint: `ident(resolved?.name)`.
   - DRF router base routes (`ANY …/` and `ANY …/{pk}/`): `ident(viewsetResolved?.name)`.
   - Action routes: `${viewset}.${action.name}` when the viewset name is known.
   - Beat, CRONJOBS, `add_periodic_task`, `add_job`, `periodic_task` and `scheduled_job`: `ident(resolved?.name)`.
   - Jobs: `fn.name`.
4. When building rows, write handler maps with `Object.fromEntries` over sorted keys and sorted unique values, and leave out poisoned or empty facts. The `endpoints` / `crons` arrays stay exactly as today.
5. Update the `toEqual` expectations in `python-project.test.ts` (`:48-63`) to include the handler maps from the Acceptance criteria. Add python-facts tests for the contact-book PR #29 shape.

**Acceptance criteria**
- [ ] The contact-book PR #29 shape gives the same `endpointHandlers` on both `apps/contacts/urls.py` and `apps/contacts/views.py` rows: `{ 'ANY /': ['contacts'], 'ANY /api/contacts/': ['ContactsViewSet'], 'ANY /api/contacts/{pk}/': ['ContactsViewSet'], 'GET /api/contacts/export/': ['ContactsViewSet.export'], 'POST /api/contacts/import_csv/': ['ContactsViewSet.import_csv'], 'POST /api/contacts/{pk}/export_to_gsheet/': ['ContactsViewSet.export_to_gsheet'] }`. The shape is:
  - `urls.py`: `router = DefaultRouter()`, `router.register(r"contacts", views.ContactsViewSet)`, `urlpatterns = [path("", views.contacts), path("api/", include(router.urls))]`;
  - `views.py`: `def contacts`, and `class ContactsViewSet` with `@action(detail=False) def export`, `@action(detail=False, methods=["post"]) def import_csv` and `@action(detail=True, methods=["post"]) def export_to_gsheet`.
- [ ] django-mini fixture (`python-project.test.ts`):
  - the contacts rows have `{ 'ANY /': ['contact_list'], 'GET /lookup/': ['contact_lookup'], 'POST /lookup/': ['contact_lookup'], 'ANY /api/contacts/': ['ContactViewSet'], 'ANY /api/contacts/{pk}/': ['ContactViewSet'], 'POST /api/contacts/import_csv/': ['ContactViewSet.import_csv'] }`;
  - `config/urls.py` and `apps/history/views.py` have `{ 'GET /api/history/': ['HistoryListView'] }`;
  - `apps/reports/tasks.py` has `cronHandlers` `{ '0 7 * * 1 (send_weekly_report)': ['send_weekly_report'], 'every 300s (cleanup)': ['cleanup'], 'job:reports.cleanup': ['cleanup'], 'job:send_weekly_report': ['send_weekly_report'] }`.
- [ ] An unresolvable target, such as a third-party view, gives the fact but no handler key. A fact registered once with a handler and once without gets no key.
- [ ] `endpoints` / `crons` arrays are byte-identical to today for every existing test.

### U3 — repo-intel persistence + caller scopes
| Field | Value |
|---|---|
| Kind | backend |
| Wave | 1 |
| Depends on | U0 |
| Owns (create/modify) | `server/src/modules/repo-intel/repository.ts` (write and read of the handler columns), `server/src/modules/repo-intel/service.ts`, `server/src/modules/repo-intel/mappers.ts` (new), `server/src/modules/repo-intel/domain/caller-scopes.ts` (new), `server/test/repo-intel-caller-scopes.test.ts` (new), `server/test/repo-intel-fact-handlers.test.ts` (new), `server/test/repo-intel-file-facts.it.test.ts` (new) |
| Must not touch | `constants.ts` and `repo-intel-python.it.test.ts` (U6); pipeline files (U1); `blast/**` (U4) |
| Consumes | §3.2 columns, §3.3 types |
| Produces | `callerScopes`, `parseFactHandlers`; `BlastResult.factsByFile[*].endpointHandlers/cronHandlers` and `BlastCallerRow.scopes` on the persistent path |
| Checks | `server: pnpm typecheck · pnpm exec vitest run test/repo-intel-caller-scopes.test.ts test/repo-intel-fact-handlers.test.ts · pnpm exec vitest run test/repo-intel-file-facts.it.test.ts (Docker) · depcruise --ignore-known` |

**Steps**
1. `replaceFileFacts` / `patchFileFacts` write `endpointHandlers: r.endpointHandlers ?? {}` and `cronHandlers: r.cronHandlers ?? {}`. The non-empty filter is unchanged.
2. `getFileFacts` also selects both columns and maps them through `parseFactHandlers(value, facts)` from the new `mappers.ts`. That uses zod `z.record(z.string(), z.array(z.string()))` with `safeParse`, reads keys with `Object.hasOwn`, and treats the jsonb as untrusted. `mappers.ts` does not import `drizzle-orm` or `db/schema`.
3. Add `domain/caller-scopes.ts` (§3.4). It is pure and imports nothing outside the module.
4. In `tryPersistentBlast` (`service.ts:342-391`):
   - set each caller's `scopes` to `callerScopes(symsByFile.get(c.fromPath) ?? [], c.line, enclosingFromRows(...))`;
   - copy the handler maps into `factsByFile[f.filePath]`.
   - The `symbol` label, dedup key, sort and slice stay exactly as they are.

**Acceptance criteria**
- [ ] `callerScopes`, TS `listOrders` range 9–11, reference at 10 → `['listOrders']`.
- [ ] `callerScopes`, Python rows `ContactViewSet` 21–28, `ContactViewSet.import_csv` 26–28, `import_csv` 26–28, reference at 27 → `['ContactViewSet', 'ContactViewSet.import_csv', 'import_csv']`.
- [ ] `callerScopes`, a module-level reference after a function → `[]`.
- [ ] `callerScopes`, a row with `endLine: null` counts only when it equals `enclosing`.
- [ ] `parseFactHandlers` drops keys that are not in `facts`, non-string values, empty lists and non-object input, and returns sorted unique lists. `{"__proto__": ["x"]}` with `facts: []` → `{}`, and there is no prototype pollution.
- [ ] Integration test: rows written with handler maps read back equal. Rows written without them (and rows inserted directly without the columns) read back with `{}`.

### U4 — Blast mapper: per-handler attribution
| Field | Value |
|---|---|
| Kind | backend |
| Wave | 1 |
| Depends on | U0 |
| Owns (create/modify) | `server/src/modules/blast/domain/handler-attribution.ts` (new), `server/src/modules/blast/domain/build-blast-radius.ts`, `server/test/blast-attribution.test.ts` (new), `server/test/blast-domain.test.ts` |
| Must not touch | `blast/domain/indirect-impact.ts`, `blast/repository.ts`, `blast/service.ts` (indirect stays file-level, Decision 8); `repo-intel/**` |
| Consumes | §3.1 `caller_facts`, §3.3 types |
| Produces | `attributeFacts`, `handlerHead`; the response's filtered group lists, `caller_facts`, the refuted-aware `unattributed_endpoints` (§3.4) |
| Checks | `server: pnpm typecheck · pnpm exec vitest run test/blast-attribution.test.ts test/blast-domain.test.ts test/blast-indirect.test.ts test/blast-service.test.ts test/blast-routes.test.ts · depcruise --ignore-known` |

**Steps**
1. Implement `handler-attribution.ts` exactly as in §3.4. It is pure, and its only import is a type-only import of `FactHandlers` from `../../repo-intel/types.js`, which is an allowed public surface.
2. In `build-blast-radius.ts`:
   - replace the per-file union (`:38-44`) with a per-kept-caller `attributeFacts`;
   - build `caller_facts`;
   - compute `reachable` / `withCallers` over every grouped row, taken before the cap, and filter refuted endpoints out of `unattributed` (`:64-65`).
   - `caller_file_facts` copies only `endpoints` / `crons` (`:74-79`, unchanged). The mapper stays pure: no clock, no I/O.
3. Write the tests from the Acceptance criteria as table-driven cases in `blast-attribution.test.ts`. Existing `blast-domain.test.ts` cases must pass with no expectation changes, except for adding `caller_facts` to existing `toEqual` assertions if any.

**Acceptance criteria**
- [ ] **contact-book #29 shape.**
  - Input:
    - `changedSymbols` = `contacts` and `ContactsViewSet` in `apps/contacts/views.py`;
    - callers = `('apps/contacts/urls.py', 'urls.py', via 'contacts', 11, scopes [])` and `(…, via 'ContactsViewSet', 7, scopes [])`;
    - `factsByFile['apps/contacts/urls.py']` = the 6 endpoints with the U2 handler map;
    - `impactedEndpoints` = the 6.
  - Expected:
    - `contacts.endpoints_affected` = `['ANY /']`;
    - `ContactsViewSet.endpoints_affected` = `['ANY /api/contacts/', 'ANY /api/contacts/{pk}/', 'GET /api/contacts/export/', 'POST /api/contacts/import_csv/', 'POST /api/contacts/{pk}/export_to_gsheet/']`;
    - `unattributed_endpoints` = `[]`, `stats.endpoints` = 6.
- [ ] **blast-radius-demo #1 shape.**
  - Input:
    - changed `formatMoney` and `roundCents` in `src/lib/money.ts`;
    - callers `listOrders` and `getOrder` (`src/routes/orders.ts`, via `formatMoney`), `createInvoice` (`src/routes/invoices.ts`, via `formatMoney`), `previewTax` (`src/routes/invoices.ts`, via `roundCents`), and `runNightlyReport` (`src/jobs/nightly-report.ts`, via both). Each caller's scopes are `[<own name>]`.
    - facts use the U1 handler maps, and the cron `'0 2 * * *'` has handler `['runNightlyReport']`.
  - Expected:
    - `formatMoney` → endpoints `['GET /api/orders', 'GET /api/orders/:id', 'POST /api/invoices']`, crons `['0 2 * * *']`;
    - `roundCents` → endpoints `['GET /api/invoices/tax']`, crons `['0 2 * * *']`;
    - `caller_facts` entry for `createInvoice` has only `POST /api/invoices`, and the one for `previewTax` has only `GET /api/invoices/tax`.
  - With only `formatMoney` changed, `GET /api/invoices/tax` appears neither in `downstream` nor in `unattributed_endpoints`, and `stats.endpoints` = 3.
- [ ] **No handler maps (today's data).** The output equals today's for the same input: group lists are the union of the caller files' facts, and `caller_facts` lists equal those files' facts.
- [ ] **Helper fallback.**
  - A caller whose scopes match no handler in its file, with no direct fact, gets all of that file's facts.
  - A caller that is a handler keeps unknown-handler facts as well as its own.
  - A `Class.method` handler is kept for changed symbol `Class`, and for a caller whose scopes contain `Class`.
- [ ] **Refuted vs capped.** An endpoint of a file whose caller rows were all cut by `maxCallersPerSymbol` stays in `unattributed_endpoints`.
- [ ] Endpoints and crons are filtered independently.

### U5 — Client graph: per-caller edges
| Field | Value |
|---|---|
| Kind | ui |
| Wave | 1 |
| Depends on | U0 |
| Owns (create/modify) | `client/src/app/repos/[repoId]/pulls/[number]/_components/BlastRadius/_components/BlastGraph/helpers.ts`, `…/BlastGraph/helpers.test.ts` |
| Must not touch | `client/src/vendor/**`, `client/src/lib/api.ts`, `messages/**`, other BlastRadius components |
| Consumes | §3.1 `caller_facts` |
| Produces | nothing |
| Checks | `client: pnpm typecheck · pnpm test -- BlastGraph` |

**Steps**
1. In `layoutBlastGraph`, when `data.caller_facts` is defined, index it by `caller:${name}|${file}` (the existing caller node id, `helpers.ts:92`) and take each caller's endpoints and crons from it. Otherwise keep the current `caller_file_facts[c.file]` path (`:98-113`). Keep the lookup in a small pure function in the same file.
2. Everything else is unchanged: the `unattributed` count, the column layout and the edge dedup.

**Acceptance criteria**
- [ ] With `caller_facts` = `[{name:'createInvoice', file:'src/routes/invoices.ts', endpoints:['POST /api/invoices'], crons:[]}, {name:'previewTax', …, endpoints:['GET /api/invoices/tax'], crons:[]}]` and a `caller_file_facts` entry listing both endpoints for that file, the edges are exactly `caller:createInvoice|… → endpoint:POST /api/invoices` and `caller:previewTax|… → endpoint:GET /api/invoices/tax`.
- [ ] Without `caller_facts`, the existing test at `helpers.test.ts:36-50` passes unchanged.

### U6 — Reindex trigger, integration tests, docs
| Field | Value |
|---|---|
| Kind | backend |
| Wave | 2 |
| Depends on | U1, U2, U3, U4 |
| Owns (create/modify) | `server/src/modules/repo-intel/constants.ts`, `server/test/repo-intel-python.it.test.ts`, `server/test/blast-attribution.it.test.ts` (new), `server/test/fixtures/express-mini/**` (new), `server/src/modules/repo-intel/README.md` |
| Must not touch | any `src` file other than `constants.ts` and the README (a real defect goes back to its unit as `BLOCKED:`); `server/INSIGHTS.md` |
| Consumes | everything above |
| Produces | `INDEXER_VERSION = 5` |
| Checks | `server: pnpm typecheck · pnpm exec vitest run .it.test (Docker) · pnpm exec vitest run --exclude '**/*.it.test.ts' · depcruise --ignore-known` |

**Steps**
1. `constants.ts`: set `INDEXER_VERSION = 5`, with a comment line: "v5: per-handler endpoint/cron attribution (file_facts.endpoint_handlers/cron_handlers); bump forces a full reindex". Change `repo-intel-python.it.test.ts:71` to `toBe(5)`.
2. `repo-intel-python.it.test.ts`:
   - Keep every existing assertion (the raw `factsByFile` at `:90` still holds).
   - For changed `apps/tools/phone.py`, add that `normalize_phone.endpoints_affected` = `['ANY /api/contacts/', 'ANY /api/contacts/{pk}/', 'GET /lookup/', 'POST /api/contacts/import_csv/', 'POST /lookup/']` (no `ANY /`), and that its `crons_affected` = `['0 7 * * 1 (send_weekly_report)', 'job:send_weekly_report']`.
   - Add a second PR that changes `apps/contacts/views.py` (the contact-book PR #29 analogue). Expected: `contact_list` → `['ANY /']`; `contact_lookup` → `['GET /lookup/', 'POST /lookup/']`; `ContactViewSet` → `['ANY /api/contacts/', 'ANY /api/contacts/{pk}/', 'POST /api/contacts/import_csv/']`. Assert only the groups that have callers from `apps/contacts/urls.py`. If the index yields no such callers, report `BLOCKED:` with the observed callers rather than weakening the test.
3. Create `test/fixtures/express-mini/`: the four blast-radius-demo files quoted in §1 plus its `package.json` / `tsconfig.json`. Do not install anything; the fixture sits outside `tsconfig` `include` (`server/tsconfig.json:28`).
4. Write `blast-attribution.it.test.ts`, modelled on `repo-intel-python.it.test.ts`. It indexes the fixture into Testcontainers pg, then calls `GET /pulls/:id/blast` for a PR that changes `src/lib/money.ts`, and asserts the U4 demo expectations end to end, `caller_facts` included.
5. README "Python facts (`file_facts`)" (`README.md:43`): document the handler columns, the rule from §3.4, and the file-level fallback and its limits (§8).

**Acceptance criteria**
- [ ] Both integration tests pass with Docker (and skip cleanly without it); the full unit suite is green.
- [ ] `INDEXER_VERSION === 5`, and `indexer-pipeline.test.ts` (which uses the symbol) passes untouched.

## 5. Waves (execution order)
| Wave | Units | Runs | Why this order |
|---|---|---|---|
| 0 | U0 | sequential, by the orchestrator | vendored contract, migration 0015 and the shared internal types that every unit compiles against |
| 1 | U1, U2, U3, U4, U5 | parallel | disjoint files; each builds only on U0 (optional fields keep the tree green in between) |
| 2 | U6 | single | needs the real writers (U1, U2), the reader (U3) and the mapper (U4) for end-to-end assertions; the version bump goes last so a reindex happens once |

Ownership check. In Wave 1:
- `repository.ts` is owned only by U3 (U0 touched it in Wave 0);
- `pipeline/*` only by U1;
- `adapters/python/*` only by U2;
- `blast/domain/*` only by U4;
- the client helper only by U5.

`constants.ts`, `repo-intel-python.it.test.ts` and the README are owned only by U6.

Serialized files: `**/src/vendor/shared/**` and migration `0015` belong to U0 only. No unit touches `server/src/modules/index.ts`, `client/src/lib/api.ts`, `client/messages/**` or any `INSIGHTS.md`.

## 6. Test plan
| Package | Tests | Owner |
|---|---|---|
| server (unit) | `test/extract.test.ts` (TS handler capture, fold, wrappers unchanged), `test/parse-file.test.ts` (demo `invoices.ts` handler map), `test/indexer-pipeline.test.ts` (rows carry maps) | U1 |
| server (unit) | `test/python-facts.test.ts` (contact-book #29 shape, poisoning, unresolved), `test/python-project.test.ts` (django-mini maps) | U2 |
| server (unit) | `test/repo-intel-caller-scopes.test.ts`, `test/repo-intel-fact-handlers.test.ts` | U3 |
| server (it) | `test/repo-intel-file-facts.it.test.ts` (column round trip, `{}` default) | U3 |
| server (unit) | `test/blast-attribution.test.ts` (both observed cases, fallback, refuted vs capped, class granularity), `test/blast-domain.test.ts` (regression) | U4 |
| server (unit) | `test/contracts.test.ts` (`caller_facts`) | U0 |
| server (it) | `test/repo-intel-python.it.test.ts` (normalize_phone per-handler lists, views.py PR analogue), `test/blast-attribution.it.test.ts` (express-mini = demo #1) | U6 |
| client | `BlastGraph/helpers.test.ts` (per-caller edges; fallback) | U5 |
| e2e | none | — |

## 7. Verification (orchestrator, after merge)
1. `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts' && pnpm exec vitest run .it.test && pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known`
2. `cd client && pnpm typecheck && pnpm test`
3. `cd server && pnpm db:migrate` on the dev DB. Then run `./scripts/dev.sh` and **resync** both repos: the version bump forces a full reindex.
   - humen-dev/contact-book PR #29: the `contacts` card shows only `ANY /`. The `ContactsViewSet` card shows `ANY /api/contacts/`, `ANY /api/contacts/{pk}/`, `GET /api/contacts/export/`, `POST /api/contacts/import_csv/` and `POST /api/contacts/{pk}/export_to_gsheet/`. The stats count 6 endpoints, and the graph edges from `urls.py` are the union of both.
   - humen-dev/blast-radius-demo PR #1: `formatMoney` lists no `GET /api/invoices/tax`. The graph links `createInvoice` only to `POST /api/invoices`.
4. Append a server `INSIGHTS.md` entry (Codebase Patterns) that supersedes the 2026-09-29 one. It records that attribution is now per handler (`file_facts.endpoint_handlers/cron_handlers`, rule in `blast/domain/handler-attribution.ts`), that indirect stays file-level, and the fallback conditions. Do not edit the old entry.
5. `/pr-self-review`. DET-003 will flag both `src/vendor/shared/contracts/review-api.ts` edits. Accept with `pr-self-review.mjs accept "<key>" --reason "blast-endpoint-attribution: additive BlastCallerFacts + optional caller_facts on BlastRadiusResponse, applied identically to server and client copies; vendored copy is the source (no upstream package in this repo)"`.

## 8. Risks
- **A handler that calls another handler loses the outer endpoint.**
  - The case: in one file, handler A (route `/a`) calls handler B (route `/b`), and B calls `S`. The caller row is B, which is a handler, so only `/b` is kept.
  - Today `/a` is shown. Helpers that are not handlers still fall back to file-level, so the loss is limited to this case.
  - It is documented in the README (U6). The fix would need intra-file references, which are out of scope.
- **Name collisions over-include, they never drop.** A handler named like `S` but a different symbol keeps extra facts. That is acceptable.
- **The caller label and scopes can disagree.** `enclosingFromRows` ignores `endLine` (`service.ts:744-749`), so a module-level reference after a function is labelled with that function's name. Scopes use ranges, so attribution is correct, but the label shown on the card may still be wrong (pre-existing).
- **Class granularity (Decision 7)** keeps a viewset's base routes for a helper called only from one `@action`. This is by design. If it proves too broad, it can be tightened later in `handler-attribution.ts` alone.
- **Resolver misses in Python** leave a fact unknown, so it stays file-level. That is today's behaviour, not a regression.
- **Stale data until reindex.** Old rows have `{}`, which gives today's output. The version bump in U6 forces a full reindex on the next refresh or resync.
- **Migration numbering.** `0015` is the next free number (the latest applied is `0014_intent_layer.sql`). If another branch lands a `0015` first, regenerate before merging. Never renumber an applied migration.
- **Vendored-contract drift and DET-003:** see §7 step 5. U0 diffs the two blocks.
- **depcruise:**
  - The new domain files import only `repo-intel/types.ts`, which is an allowed public surface.
  - `mappers.ts` imports zod only.
  - Nothing may be added to `.dependency-cruiser-known-violations.json`.
- **Untrusted repo content (security):**
  - Fact strings and handler names come from the analysed repository and become jsonb keys and values.
  - Writers build maps with `Map` and `Object.fromEntries` (own properties). Readers validate with zod and use `Object.hasOwn`.
  - Nothing is evaluated, and the handler identifier regexes are anchored and linear, so there is no ReDoS.
  - The reviewer-core grounding gate and `INJECTION_GUARD` are not touched.

## 9. Out of scope
- Fixing the `enclosingFromRows` caller label to respect `endLine`.
- Handler-aware indirect impact (hops ≥ 2).
- Intra-file call graphs, so handler → handler chains stay a known gap.
- TS member-expression or wrapped handlers, multi-line registrations, NestJS/decorator routing, and Fastify `route({...})` objects spread over several lines. All of these stay file-level.
- Changes to the Blast Radius card UI, the MCP formatter or e2e flows.
