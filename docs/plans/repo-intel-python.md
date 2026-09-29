# Repo-intel for Python (Django / Flask / FastAPI / Celery) — development plan

| Field | Value |
|---|---|
| Status | deferred (2026-09-29): planned, not approved, no code written |
| Goal | A reviewer opening a PR on a Python/Django repo (e.g. `humen-dev/contact-book`) sees real Blast Radius data: the changed Python symbols, their callers as `file:line`, and the affected HTTP endpoints and cron/background jobs. The Blast Radius feature itself (module, contract, client card, MCP tool) stays unchanged. |
| Packages touched | server (only `src/adapters/python/**` (new), `src/adapters/depgraph/index.ts`, `src/modules/repo-intel/{constants.ts,pipeline/*,README.md}`, tests and a test fixture) |
| Branch | `feat/repo-intel-python`, cut from `L04` (already has Blast Radius, see `docs/plans/blast-radius.md`) |

## 0. Resume here (read first)

This plan was parked on 2026-09-29 before approval, and no code exists for it yet. The branch `feat/repo-intel-python` was deleted. To pick it up again:

1. **Why it is needed.** `repo-intel` indexes only `.ts .tsx .js .jsx .mjs .cjs` (`server/src/modules/repo-intel/constants.ts:14`). A Python repo therefore indexes as `status: full` with 0 symbols, and Blast Radius shows "No changed symbols found" for every PR. The user's Django repos `humen-dev/contact-book` and `humen-dev/support-platform-fork` show 0 symbols in all 55 PRs.
2. **Where the index comes from.**
   - walk: `SUPPORTED_EXT`
   - symbols and references: `@ast-grep/napi` 0.43 with TS/TSX/JS grammars (`server/src/adapters/astgrep/index.ts`)
   - import graph: dependency-cruiser (`server/src/adapters/depgraph/index.ts`), then PageRank (`pipeline/rank.ts`)
   - endpoint and cron facts: regexes (`server/src/adapters/codeindex/extract.ts:182,202`)

   Blast Radius (`server/src/modules/blast`) only reads this index, so it needs **no changes**.
3. **Re-check before starting.** The plan cites `file:line` as of `L04` @ `34216dc`. If `repo-intel` has moved since, re-run `planner` with this file as input so it refreshes the citations.
4. **Decide the open questions (§1 → Open questions).** Each has a default:
   1. Parser. Default: a pure-TS scanner with no new dependencies. The alternatives are `@ast-grep/lang-python` (0.0.x, postinstall blocked by pnpm, experimental API) and `web-tree-sitter`.
   2. Django endpoints. Default: attribute them to both `urls.py` and the view file.
   3. U8 `unsupported_language` reason. Default: skip.
   4. Files a PR adds. Default: accept that they are invisible, because the index is built from the default branch.
5. **Run the pipeline:**
   1. Cut a branch from the current base.
   2. Wave 0: write `server/src/adapters/python/types.ts` verbatim from §3.1.
   3. Then one `implementer` per unit in waves (§5).
   4. After every wave: `plan-verifier`.
   5. Then `architecture-reviewer`, then `/pr-self-review`.
6. **Verify:**
   1. Resync the Django repo. `INDEXER_VERSION` 2 → 3 forces a full re-index on the next resync.
   2. Open a PR that **modifies** an existing shared helper. PR #30 in `contact-book` adds `apps/tools/phone.py`, which is not on the default branch.
   3. Check that Blast radius lists `file:line` callers and `ANY /path`-style Django endpoints.

For a working TS demo of Blast Radius in the meantime, use the private repo `humen-dev/blast-radius-demo`:
- branch `feat/money-rounding`: 4 callers, 3 endpoints, 1 cron;
- branch `refactor/slugify`: a symbol with no callers;
- branch `docs/readme`: no changed symbols.

## 1. Context

### What exists today

**Walk and scope**
- `SUPPORTED_EXT` is `.ts .tsx .js .jsx .mjs .cjs` (`server/src/modules/repo-intel/constants.ts:14`).
- `EXCLUDED_DIRS` (`constants.ts:17-26`) has no Python entries (`.venv`, `__pycache__`, `site-packages` …).
- `walkClone` filters by these two sets (`server/src/modules/repo-intel/pipeline/walk.ts:33-34`, `:93`, `:100-101`) and does not honour `.gitignore` (`walk.ts:14-18`).
- Incremental indexing intersects the git diff with the same set (`pipeline/incremental.ts:50`, `:118`).
- So a Django repo is walked with 0 `.py` files.

**Symbols and references**
- Both come from `@ast-grep/napi` 0.43 (`server/package.json:18`), TS/TSX/JS only. `langForFile` returns `null` for anything else (`server/src/adapters/astgrep/index.ts:57-76`), and a test pins `.py → null` (`server/test/astgrep.test.ts:26`, `:119`).
- Method model: every class method is emitted twice, `Class.method` and bare `method`, and `exported` tracks the class (`astgrep/index.ts:13-15`, `:254-282`).
- The full pipeline gates each file on `langForFile` (`pipeline/full.ts:137-141`) and parses with `parseSymbols` / `parseReferences` (`full.ts:155-160`). Incremental does the same (`incremental.ts:147-170`).

**Import graph, reference resolution and rank**
- The graph comes from dependency-cruiser (`server/src/adapters/depgraph/index.ts:56-105`). It is JS-only: it feeds the walk's file list straight into `cruise` (`depgraph/index.ts:61`, `:70-72`) and keeps only `SUPPORTED_EXT` targets (`:47-53`, `:92`).
- `resolveReferences` sets `references.decl_file` only when the importer has a `file_edges` row to a file that declares an **`exported = true`** symbol with that name, and only if that candidate is unique (`server/src/modules/repo-intel/repository.ts:400-425`, `:412`).
- PageRank runs over `file_edges` (`pipeline/rank.ts:25-37`). Resolved callers inner-join `file_rank` (`repository.ts:503-531`).

**Endpoint and cron facts**
- Per-file regexes, Express/Fastify style: `extractEndpoints` (`server/src/adapters/codeindex/extract.ts:182-195`) and `extractCrons` (`extract.ts:202-214`, which also emits `job:<kind>` for queue registrations).
- They are written to `file_facts`, one row per file (`full.ts:186-190`, `repository.ts:371-384`; incremental uses `patchFileFacts`, `repository.ts:596-617`).

**Blast read path (unchanged by this plan)**
- `getBlastRadius` → `tryPersistentBlast` (`server/src/modules/repo-intel/service.ts:221-227`, `:316-392`). Changed symbols are all symbols declared in the changed files, skipping the qualified `Class.method` form (`:325-337`).
- Callers are the resolved references (`:343`).
- Endpoints and crons are read from the **callers' files'** `file_facts` (`:377-383`). Blast attributes them to the changed symbol whose callers live in that file (`server/src/modules/blast/domain/build-blast-radius.ts:38-44`).
- **Consequence:** a Django endpoint helps blast only if it sits in the facts of a file that *calls* the changed code, i.e. the view file (and the urlconf that references the view), not just the `urls.py` that registers it.

**Schemas are language-agnostic, so no migration is needed**
- `symbols(path,name,kind,line,end_line,exported,signature)` and `references(from_path,to_symbol,line,decl_file)` (`server/src/db/schema/context.ts:61-118`).
- `file_edges(from_file,to_file)` and `file_facts(file_path, endpoints jsonb, crons jsonb)` (`server/src/db/schema/repo-intel.ts:55-88`).

**Reindex trigger**
- A mismatch with `INDEXER_VERSION` (`constants.ts:39`, currently `2`) makes `runIncremental` delegate to `runFullIndex` (`incremental.ts:75-80`). The version check runs *before* the "sha unchanged" short-circuit (`:97`).
- Incremental runs on `POST /repos/:id/resync` (`server/src/modules/repo-intel/routes.ts:53` → `service.ts:144-163`) and on repo refresh (`server/src/modules/repos/service.ts:129`).
- New clones enqueue a full index (`repos/service.ts:68`).
- Nothing reindexes on server boot. **A version bump takes effect on the next resync/refresh of each repo.**

**Architecture guard rails that shape this plan**
- depcruise `adapters-not-into-modules` (`server/.dependency-cruiser.cjs:139-144`). The existing `astgrep → repo-intel/constants` and `depgraph → repo-intel/constants` edges are baselined (`server/.dependency-cruiser-known-violations.json:2-29`). **New adapter files must not import `modules/**`** (a new edge = CI failure).
- The pipeline already imports adapter functions directly (`full.ts:29-30`) with no rule violation. Only its `Container` type import is baselined (`known-violations.json:46-74`).

**Real target repos (local clones, read as data)**
- `server/clones/humen-dev/contact-book`:
  - `manage.py` sits at the repo root.
  - The root urlconf `contact_book/urls.py:25-45` uses `include("apps.contacts.urls")` and `ContactArchiveListView.as_view()`.
  - `apps/contacts/urls.py:4-13` has `from apps.contacts import views`, `router.register(r"contacts", views.ContactsViewSet)`, `path("", views.contacts)` and `path("api/", include(router.urls))`.
  - `apps/contacts/views.py:12-13`, `:27-29`: helpers are imported with `from apps.tools.csv_writer import generate_csv`, the serializer is linked with `serializer_class = ContactsSerializer` (not a call), and there are DRF `@action(...)` methods (`:36`, `:92`, `:119`).
  - `apps/tools/phone.py` is **not** on the default branch (it is presumably added by PR #30).
- `server/clones/humen-dev/support-platform-fork`:
  - `CELERY_BEAT_SCHEDULE = {}` (`support_system/settings.py:279`).
  - Background tasks use `@app.task(name=..., queue=...)` (`apps/companies/tasks.py:11`, `apps/sp_chat/tasks.py:17`).
  - The root urlconf is `urlpatterns = ([path(..., include('apps.x.urls')), …] + static(...))` (`support_system/urls.py:6-30`). App urlconfs use `views.X.as_view()`.
  - It also has Channels websocket routing (`support_system/routing.py`) and JS/Vue sources, so it is a mixed-language repo.

**INSIGHTS relied on**
- server 2026-09-29: the blast facade's own `degraded`/`reason` are unreliable, and blast refines them. That is why blast needs no change here.
- server 2026-09-18: use `dirname()`, never `lastIndexOf('/')`. `server/test/indexer-walk.test.ts:18-23` still has that bug.
- server 2026-09-27: no `**/` inside `/** */` JSDoc. Python glob-like prose such as "`**/migrations/**`" must not appear in block comments.
- server 2026-09-27: read regex captures by named group.
- server 2026-09-22 / 2026-09-21: depcruise rules, and the baseline must never grow.

**What the user asked for:** index `.py` files (walk + incremental), Python symbols and references, Python import resolution → `file_edges` (so `decl_file` and PageRank work), Django/Flask/FastAPI endpoint facts and Celery/APScheduler cron facts, and an `INDEXER_VERSION` bump. Blast, the contract, the client and MCP stay unchanged.

### Decisions

1. **Parser: default (b), a dependency-free pure-TS Python scanner. Needs user decision (Open question 1).**

   The scanner is a line/indent-aware tokenizer plus a small tolerant expression parser. It produces one `PyOutline` (§3.1) that every other unit consumes, so the parser can be swapped without touching the other units.

   | | (a) `@ast-grep/lang-python` + `registerDynamicLanguage` | (b) pure-TS scanner **(default)** | (c) `web-tree-sitter` + `tree-sitter-python` wasm |
   |---|---|---|---|
   | Accuracy | Real grammar | Outline-level only (defs, classes, imports, calls, literals). Enough for symbols, refs and facts | Real grammar |
   | New deps | 1 native-ish package, 0.0.x maturity (latest `0.0.6`, depends on `@ast-grep/setup-lang`, runs a `postinstall`) | none | 2 (runtime + grammar wasm) |
   | Windows | Ships `prebuilds/prebuild-Windows-X64` (plus Linux x64/arm64, macOS x64/arm64). pnpm 10 blocks its `postinstall` unless the build is explicitly allowed | n/a | Portable, no build |
   | API fit | `registerDynamicLanguage` exists in napi 0.43 but is `@experimental` and "should be called exactly once in the program" (`server/node_modules/.pnpm/@ast-grep+napi@0.43.0/node_modules/@ast-grep/napi/types/registerDynamicLang.d.ts:23-27`). It is a process-global side effect, and all languages must go in one call. Compatibility of lang-python 0.0.6 with napi 0.43 is **unverified** (needs a spike) | Synchronous, matches the per-file watchdog in `full.ts:155-160` | Async init (`Parser.init()` + `Language.load`), which clashes with the sync `parseSymbols` shape |
   | Cost | Wave 0 dep change by the orchestrator (implementers never touch deps). Violates the user's standing "no installs" preference unless approved | ~1 large unit (U1) | Same dep cost as (a) and more glue |

   - *Why (b) is the default:* zero supply-chain surface, no native build, deterministic, fully unit-testable.
   - *Why (b) is enough:* every downstream need (module-level defs/classes/methods, imports, call sites with literal args, dict literals for `beat_schedule`) is outline-level.
   - *Cost of (b):* the scanner is maintained by us. It is tolerant by design (never throws; recovers at EOF on an unterminated string or bracket).
   - If the user picks (a), Wave 0 adds `pnpm add @ast-grep/lang-python@0.0.6` with the build allowed, and adds `'@ast-grep/lang-python'` to `SDKS` in `server/.dependency-cruiser.cjs:24-33`. U1 then builds the same `PyOutline` from the tree-sitter tree in `server/src/adapters/python/scan.ts`. Nothing else in the plan changes.
   - Sources: [npm @ast-grep/lang-python](https://www.npmjs.com/package/@ast-grep/lang-python), [ast-grep/langs](https://github.com/ast-grep/langs), [unpkg prebuilds listing](https://app.unpkg.com/@ast-grep/lang-python@0.0.6/files/prebuilds), [registry metadata](https://registry.npmjs.org/@ast-grep/lang-python/latest).

2. **Language routing lives in a new pipeline-local dispatcher (`pipeline/parse-file.ts`). `adapters/astgrep` is untouched.**
   - `.py` → `adapters/python`. The existing TS/JS path is unchanged.
   - The TS regex facts (`extractEndpoints` / `extractCrons`) run **only for JS/TS files**, so FastAPI decorators are not double-counted by the Express regex.
   - *Rejected:* teaching `astgrep.langForFile` about `.py`. It breaks `astgrep.test.ts:26` and mixes two parsers in one adapter.

3. **Python import edges and Python facts come from one project-level pass, `analyzePythonProject(root, files, …)` in `server/src/adapters/python/project.ts`, called by the pipeline next to `container.depgraph.buildEdges`.**
   - Both need the same cross-file module resolution. A urlconf's view lives in another file, and a Celery beat entry names its task by dotted string.
   - Called like the existing direct `astgrep` / `codeindex` imports (`full.ts:29-30`). It is in-process pure code, not an external system, so there is no new port.
   - *Rejected:* a composite `DepGraph` wired in `platform/container.ts`. It only covers edges (facts would still need the resolver), and it would touch the composition root.

4. **`depgraph` keeps JS/TS only.** `DepCruiseGraph.buildEdges` filters its input to `JS_TS_EXT` before calling `cruise`, so `.py` paths never reach dependency-cruiser. An unknown extension could otherwise fail the whole cruise, and `depgraph/index.ts:100-103` would then degrade to `[]` for the TS half of a mixed repo.

5. **Python symbol model follows the TS model.**
   - Module-level `def` / `async def` → `function`.
   - `class` → `class`.
   - Methods (defs directly in a class body) are emitted twice: `Class.method` and bare `method`, both kind `method`.
   - Nested functions and nested classes (e.g. `class Meta`) are not symbols.
   - "Module-level" means "not inside a `def`/`class` body". Defs inside a top-level `if` / `try` / `with` count.
   - **`exported = true` for every Python symbol, including `_private` ones.** Python has no export keyword, and `resolveReferences` requires `exported = true` (`repository.ts:412`), so `from x import _helper` must still resolve.
   - *Rejected:* `exported = !name.startsWith('_')` (breaks resolution) and honouring `__all__` (extra complexity, rarely used in Django apps).

6. **Python reference model (recall-first; resolution provides the precision).** A reference is kept only if its name is `exported` in a file the referrer imports, and the candidate is unique (`repository.ts:400-425`). The rules are exact in §3.2.
   - A bare call `f(…)` counts.
   - A bare use of any name bound by `from … import` counts, including `serializer_class = ContactsSerializer`, base classes, decorators and call arguments. The **original** name is emitted when the import used an alias.
   - For a dotted use `a.b.c` whose head `a` is import-bound, emit `b`. If the whole chain is called, also emit `c`.
   - Excluded: import statements, declaration name/line pairs, Python keywords/builtins, and `self`/`cls`.

7. **Import resolution (§3.3):**
   - Absolute, relative (`.`/`..`) and `from pkg import submodule` (the submodule file wins over `pkg/__init__.py`).
   - Package `__init__.py`, with **one hop** of `from .x import name` re-exports.
   - Source roots, in order: each directory containing `manage.py`, then `src/`, then the repo root.
   - Fallback: a unique path-suffix match.
   - The edge goes to the most specific resolved file only (no extra edges to parent `__init__.py`, which would inflate their PageRank).

8. **Endpoint format stays `"METHOD /path"`** (as `extract.ts:190`). Method inference:
   - `ANY` is used when the method is unknown. This is always the case for Django `path()` / `re_path()` / `url()`, except in these cases:
     - A function view decorated with `@api_view([...])`, `@require_http_methods([...])`, `@require_GET`, `@require_POST` or `@require_safe` gets one entry per method.
     - A class-based view (`X.as_view()`) gets its HTTP-verb methods (`get`, `post`, …) when it defines any, otherwise `ANY`.
   - DRF `router.register(prefix, ViewSet)` → `ANY <p>/` and `ANY <p>/{pk}/`, plus each `@action` as `METHOD <p>/<url_path>/` (or `<p>/{pk}/<url_path>/` when `detail=True`).
   - Flask `@x.route(path, methods=[…])` (default `GET`) and `@x.get/post/…`. FastAPI `@x.get/post/put/patch/delete/options/head(path)` and `@x.api_route(path, methods=[…])`.
   - Same-file `Blueprint(url_prefix=)` / `APIRouter(prefix=)` prefixes are applied.
   - Django `include()` prefixes are composed across files (cycle guard, depth ≤ 8).

9. **Fact attribution: each Python fact is written to the registering file AND to the resolved target file** (the view or the task).
   - A changed helper → caller `views.py` → its endpoints.
   - A changed view → caller `urls.py` → the urlconf's endpoints.
   - Known over-approximation: a urlconf's facts list every endpoint it registers, so a changed view's group shows all endpoints of that `urls.py`. This matches today's file-level granularity for TS (`service.ts:377-383`). Open question 2 offers the stricter variant.

10. **Cron / job facts** (formats exact in §3.4):
    - Celery beat, from a dict literal assigned to a name ending in `beat_schedule` (e.g. `CELERY_BEAT_SCHEDULE`, `app.conf.beat_schedule`), from `conf.update(beat_schedule=…)`, and from `add_periodic_task(...)`.
    - `@periodic_task(run_every=…)`.
    - APScheduler `add_job(func, 'cron'|'interval', …)` / `@x.scheduled_job(...)`.
    - django-crontab `CRONJOBS`.
    - Background-job facts `job:<name>` for `@shared_task` / `@<x>.task`. This is parity with the TS `job:<kind>` facts (`extract.ts:210-211`), and it is what gives `support-platform-fork` any "crons affected" at all (its beat schedule is empty).

11. **Walk exclusions for Python:**
    - Add `__pycache__`, `.venv`, `venv`, `.tox`, `.nox`, `site-packages`, `.mypy_cache`, `.pytest_cache`, `.ruff_cache` and `.eggs` to `EXCLUDED_DIRS`.
    - Skip any directory that contains `pyvenv.cfg` (a virtualenv root under any name).
    - Skip `.py` files that have a `migrations` path segment. This is Python-only: TS/JS files under a `migrations/` directory stay indexed, so today's TS behaviour does not change.

12. **`INDEXER_VERSION` 2 → 3, bumped by the final wiring unit (U6), not in Wave 1.** Otherwise a dev server running between waves would reindex every repo with half-built Python support.

13. **No DB migration** (schemas are language-agnostic, see §1).

14. **Blast, the shared contract, the client and MCP are not touched.** An `unsupported_language` degraded reason is listed as optional unit U8, off by default (Open question 3).

### Open questions

1. **Parser choice** (Decision 1).
   - a) `@ast-grep/lang-python` → the user approves a Wave 0 `pnpm add` (with `--allow-build`) plus a compatibility spike on Windows.
   - b) Pure-TS scanner, no new deps.
   - c) `web-tree-sitter` wasm.
   - *Default:* b).
2. **Urlconf fact attribution** (Decision 9).
   - a) Registering file **and** target file.
   - b) Target (view) file only. A PR that changes only `views.py` then shows no endpoints (its callers are `urls.py` files without facts).
   - *Default:* a).
3. **Optional U8 `unsupported_language` DegradedReason.** It needs a Wave 0 edit of both vendored `contracts/review-api.ts` copies, the repo-intel `types.ts` and the blast degradation.
   - a) Skip.
   - b) Schedule U8 as Wave 5.
   - *Default:* a).
4. **Files added by the PR.** The index is built from the default-branch clone (see `docs/plans/blast-radius.md` Risks), so a file that exists only in the PR (e.g. `apps/tools/phone.py` in contact-book PR #30) has no indexed symbols, and blast shows nothing for it.
   - a) Accept. Manual verification uses changed files that also exist on the default branch.
   - b) Follow-up plan: overlay a diff-scoped parse of the PR head.
   - *Default:* a).

## 2. Affected modules

| Package | Touched? | Why / what changes | Architecture rule that applies |
|---|---|---|---|
| server | yes | New `src/adapters/python/` (types, scanner, symbols/refs, import resolver, facts, project pass, barrel). `adapters/depgraph/index.ts` JS-only input filter. `modules/repo-intel/constants.ts` (ext sets, exclusions, version), `pipeline/walk.ts`, new `pipeline/parse-file.ts`, `pipeline/full.ts`, `pipeline/incremental.ts`, `README.md`. Tests plus the `test/fixtures/django-mini/` fixture | Ring 3 (infrastructure) for everything under `src/adapters/python/`. It is pure and in-process and must **not** import `src/modules/**` (`adapters-not-into-modules`, `.dependency-cruiser.cjs:139-144`). The pipeline is unchanged in kind (direct adapter-function calls, `full.ts:29-30`). No `container.ts`, no routes, no repository changes. depcruise baseline must not grow |
| client | no | — | — |
| reviewer-core | no | — | grounding gate / INJECTION_GUARD untouched |
| e2e | no | No flow asserts Python indexing. The fixture is exercised by a server `*.it.test.ts` | — |
| shared (vendored) | no (only if U8 is chosen) | — | If U8: Wave 0, both copies identical, DET-003 accept |

## 3. Contracts (the Interfaces every unit agrees on)

### 3.1 `server/src/adapters/python/types.ts` — Wave 0, written verbatim by the orchestrator

```ts
/**
 * Python indexing contracts (docs/plans/repo-intel-python.md §3.1).
 * Pure data shapes shared by scan / symbols / imports / facts / project.
 * This file must not import anything outside src/adapters/python.
 */

// ---------------------------------------------------------------- scanner --

export interface PyImportName {
  name: string;
  alias: string | null;
}

export interface PyImport {
  kind: 'import' | 'from';
  /** 1-based line of the statement's first token. */
  line: number;
  /** Leading dots of a `from` import (0 = absolute). Always 0 for kind 'import'. */
  level: number;
  /** Dotted module. '' for `from . import x`. One PyImport per module for `import a, b.c`. */
  module: string;
  /** kind 'from' only; [] for kind 'import' and for star imports. */
  names: PyImportName[];
  /** `from m import *`. */
  star: boolean;
  /** kind 'import' only: `import a.b as ab` → 'ab'; otherwise null. */
  alias: string | null;
}

export type PyExpr =
  | { kind: 'str'; value: string; line: number }
  | { kind: 'num'; value: string; line: number }
  | { kind: 'name'; dotted: string; line: number }
  | PyCall
  | { kind: 'seq'; items: PyExpr[]; line: number }
  | { kind: 'dict'; entries: PyDictEntry[]; line: number }
  | { kind: 'other'; text: string; line: number };

export interface PyCall {
  kind: 'call';
  /** Dotted text of the callee when it is a plain name chain (`views.X.as_view`), else ''. */
  callee: string;
  args: PyArg[];
  line: number;
  endLine: number;
}

export interface PyArg {
  /** Keyword name for `k=v`, else null. */
  keyword: string | null;
  star: '' | '*' | '**';
  value: PyExpr;
}

export interface PyDictEntry {
  /** null for a `**spread` entry. */
  key: PyExpr | null;
  value: PyExpr;
}

export interface PyDecorator {
  line: number;
  /** A 'name' (`@api_view`) or a 'call' (`@api_view(["GET"])`). */
  expr: PyExpr;
}

export interface PyFunction {
  name: string;
  line: number;
  /** Last non-blank line of the body (same line for one-liners). */
  endLine: number;
  async: boolean;
  decorators: PyDecorator[];
  /** Header text from `def`/`async def` to (excluding) the closing ':', whitespace collapsed, NOT length-trimmed. */
  signature: string;
}

export interface PyAssignment {
  line: number;
  /** Dotted plain-name targets (`x`, `app.conf.beat_schedule`); tuple/subscript targets are skipped. */
  targets: string[];
  op: '=' | '+=' | ':';
  /** null for a bare annotation `x: int`. */
  value: PyExpr | null;
}

export interface PyClass {
  name: string;
  line: number;
  endLine: number;
  /** Arguments of the class header (`class X(A, metaclass=M)`). */
  bases: PyArg[];
  decorators: PyDecorator[];
  /** `class Name(Bases)` header, whitespace collapsed, NOT length-trimmed. */
  signature: string;
  /** Defs directly in the class body. */
  methods: PyFunction[];
  /** Assignments directly in the class body. */
  assignments: PyAssignment[];
}

export interface PyNameUse {
  /** Longest plain name chain as written: 'foo' or 'views.contact_list'. */
  dotted: string;
  line: number;
  /** True when this chain is directly the callee of a call. */
  isCall: boolean;
}

export interface PyOutline {
  /** Every import statement at any depth (incl. inside functions / try blocks), source order. */
  imports: PyImport[];
  /** Module-level defs (not inside a def/class body; inside top-level if/try/with counts). */
  functions: PyFunction[];
  /** Module-level classes (same rule). */
  classes: PyClass[];
  /** Module-level assignments (same rule). */
  assignments: PyAssignment[];
  /** Every call expression at any depth, source order (nested calls appear separately). */
  calls: PyCall[];
  /**
   * Every name chain in expression position at any depth, EXCLUDING: tokens of import
   * statements, the declared name and parameter names of def/class headers, keyword-argument
   * names (`name=`), whole LHS targets of assignment statements, `global`/`nonlocal` lists.
   */
  nameUses: PyNameUse[];
}

// ---------------------------------------------------------- symbols/refs --

export interface PySymbol {
  name: string;
  kind: 'function' | 'class' | 'method';
  line: number;
  endLine: number;
  exported: boolean;
  signature: string | null;
}

export interface PyReference {
  toSymbol: string;
  line: number;
}

// ---------------------------------------------------------------- imports --

/** Opaque-ish lookup structure built once per project pass. */
export interface PyModuleIndex {
  /** Repo-relative POSIX paths of every indexed .py file. */
  files: ReadonlySet<string>;
  /** Ordered source roots ('' = repo root), see plan §3.3. */
  sourceRoots: readonly string[];
}

export interface PyFileEdge {
  from: string;
  to: string;
}

/** A resolved Python target: the file plus the symbol name inside it ('' = the module itself). */
export interface PyResolved {
  file: string;
  name: string;
}

/** Returns the imports of an already-scanned file ([] when unknown). */
export type PyImportsOf = (file: string) => readonly PyImport[];

// ------------------------------------------------------------------ facts --

export type PyTarget =
  /** A plain name chain written in code: 'views.contact_list', 'ContactViewSet'. */
  | { kind: 'expr'; dotted: string }
  /** A dotted string literal: 'apps.contacts.urls', 'apps.reports.tasks.send_weekly_report'. */
  | { kind: 'string'; dotted: string }
  /** A definition in the registering file itself (decorated function). */
  | { kind: 'local'; name: string };

export interface PyEndpointReg {
  /** Uppercase verb, or null = infer (Django) → ANY / view methods. */
  method: string | null;
  /** Route fragment exactly as written (prefixes applied later). */
  path: string;
  target: PyTarget | null;
  line: number;
}

export interface PyRouterReg {
  /** Local variable holding the router (`router`). */
  routerVar: string;
  /** Registered prefix as written (`r"contacts"`, value only). */
  prefix: string;
  viewset: PyTarget;
  line: number;
}

export interface PyIncludeReg {
  /** Route fragment of the enclosing path()/re_path(). */
  prefix: string;
  target: { kind: 'module'; ref: PyTarget } | { kind: 'router'; routerVar: string };
  line: number;
}

export interface PyCronReg {
  /** Rendered schedule: 5-field cron, 'every <n><s|m|h|d>', or 'schedule'. */
  schedule: string;
  /** Short label (task/function name). */
  label: string;
  target: PyTarget | null;
  line: number;
}

export interface PyFileRegistrations {
  file: string;
  endpoints: PyEndpointReg[];
  routers: PyRouterReg[];
  includes: PyIncludeReg[];
  crons: PyCronReg[];
  /** Fully rendered `job:<label>` facts declared in this file. */
  jobs: string[];
}

export interface PyViewAction {
  /** `url_path=` or the method name. */
  urlPath: string;
  detail: boolean;
  /** Uppercase, sorted; ['GET'] when `methods=` is absent. */
  methods: string[];
}

export interface PyViewInfo {
  /** Uppercase sorted verbs, or null = unknown → ANY. */
  methods: string[] | null;
  /** DRF @action methods (classes only). */
  actions: PyViewAction[];
}

export interface PyFactsResolver {
  resolveTarget(fromFile: string, target: PyTarget): PyResolved | null;
}

export interface PyFactsRow {
  filePath: string;
  /** Sorted, unique. */
  endpoints: string[];
  /** Sorted, unique. */
  crons: string[];
}

// ---------------------------------------------------------------- project --

export interface PythonProjectResult {
  edges: PyFileEdge[];
  /** One row per file with ≥1 fact. */
  facts: PyFactsRow[];
  /** Files that could not be read/scanned (never throws). */
  degraded: Array<{ file: string; reason: string }>;
  /** True when the deadline stopped the pass early. */
  truncated: boolean;
}
```

### 3.2 Function signatures (produced by the owning unit, consumed as-is)

```ts
// U1 — server/src/adapters/python/scan.ts
export function scanPython(source: string): PyOutline; // never throws

// U3 — server/src/adapters/python/symbols.ts
export function parsePythonSymbols(file: string, source: string, maxSignatureChars: number): PySymbol[];
export function parsePythonReferences(file: string, source: string): PyReference[];

// U4 — server/src/adapters/python/imports.ts
export function buildModuleIndex(files: readonly string[]): PyModuleIndex;
export function resolveModule(index: PyModuleIndex, fromFile: string, level: number, dotted: string): string | null;
export function resolveImport(index: PyModuleIndex, fromFile: string, imp: PyImport, importsOf: PyImportsOf): string[];
export function buildPythonEdges(index: PyModuleIndex, importsOf: PyImportsOf): PyFileEdge[];
export function resolveNameToFile(index: PyModuleIndex, fromFile: string, dotted: string, importsOf: PyImportsOf): PyResolved | null;
export function resolveDottedString(index: PyModuleIndex, dotted: string): PyResolved | null;

// U5 — server/src/adapters/python/facts.ts
export function extractPythonRegistrations(file: string, outline: PyOutline): PyFileRegistrations;
export function collectViewInfo(outline: PyOutline): Record<string, PyViewInfo>;
export function attributePythonFacts(
  regs: readonly PyFileRegistrations[],
  viewInfoByFile: ReadonlyMap<string, Record<string, PyViewInfo>>,
  resolver: PyFactsResolver,
): PyFactsRow[];

// U6 — server/src/adapters/python/project.ts (+ barrel index.ts re-exporting all of the above and types)
export function isPythonFile(path: string): boolean; // extension '.py' (case-insensitive)
export function analyzePythonProject(
  root: string,
  files: readonly string[], // repo-relative; non-.py entries are ignored
  opts: { deadlineAt: number }, // epoch ms; stop early → truncated: true
): Promise<PythonProjectResult>; // never throws
```

**Reference rules (U3, exact):** these are applied to `scanPython(source).nameUses`.
- The binding tables come from `imports`:
  - `fromBound: localName → originalName`, from every `from` import name (`alias ?? name` → `name`).
  - `moduleBound: Set<localName>`, from `import a.b` (binds `a`) and `import a.b as x` (binds `x`).
- Rules:
  1. `dotted` has no `.`:
     - if it is `fromBound` → emit `fromBound[n]`;
     - else if `isCall` → emit `n`.
  2. `dotted` = `h.s1…sk`:
     - if `h ∈ fromBound` → emit `fromBound[h]` and `s1`;
     - else if `h ∈ moduleBound` → emit `s1`.
     - Then, if `isCall`, also emit `sk` (the rightmost segment).
  3. Never emit:
     - a name in `PY_KEYWORDS` ∪ `PY_BUILTINS` (module constants in `symbols.ts`: at least `self cls print len str int float bool dict list set tuple type object super isinstance issubclass range enumerate zip map filter sorted reversed min max sum any all open getattr setattr hasattr delattr repr hash id iter next vars dir callable format round abs divmod pow input exec eval compile globals locals staticmethod classmethod property Exception BaseException ValueError TypeError KeyError IndexError AttributeError RuntimeError NotImplementedError StopIteration ImportError OSError None True False`);
     - a `(name, line)` pair equal to a symbol declared in the same file.
  4. Dedupe on `(toSymbol, line)`. Output is in source order.

**Symbol rules (U3, exact):**
- `functions` → kind `function`.
- `classes` → kind `class`, plus for each method `Class.method` and `method` (both kind `method`, with the method's line and endLine).
- `exported: true` always.
- `signature` = the outline signature, trimmed to `maxSignatureChars` (if longer: first `max-1` chars + `…`).
- Dedupe on `name:kind:line`.

### 3.3 Import resolution (U4, exact)

**Source roots.** `buildModuleIndex(files)`:
- `sourceRoots` = the directories of every file whose basename is `manage.py` (sorted by depth, then alphabetically), then `'src'` if any file starts with `src/`, then `''`.
- No duplicates.

**`resolveModule(index, fromFile, level, dotted)`**
- `level = 0` (absolute):
  - For each root `r` in order, try `join(r, dotted as path) + '.py'`, then `…/__init__.py`. The first hit in `files` wins.
  - Otherwise use a suffix fallback: the files whose path equals or ends with `/<dotted as path>.py` or `/<dotted as path>/__init__.py`. Return the file if exactly one matches, else `null`.
- `level ≥ 1` (relative):
  - `base` = `dirname(fromFile)` walked up `level-1` times.
  - If `dotted` is `''`, the target is `base/__init__.py`. Otherwise try `base/<dotted as path>.py`, then `…/__init__.py`.
  - No suffix fallback.

**`resolveImport(index, fromFile, imp, importsOf)`** returns deduped files, excluding `fromFile`.
- `kind 'import'`: the deepest resolvable prefix of `imp.module` (`a.b.c`, then `a.b`, then `a`).
- `kind 'from'`, star: `resolveModule(level, module)`.
- `kind 'from'`, for each name:
  - Try `sub = resolveModule(level, module + '.' + name)` (just `name` when `module` is `''`).
  - If there is a hit, use it. Otherwise use `m = resolveModule(level, module)`.
  - If `m` ends with `__init__.py` and `importsOf(m)` contains a `from` import that binds `name` (`alias ?? name`), then use that import's resolved module file instead. This is one hop only.

**`buildPythonEdges(index, importsOf)`** returns, for every file in the index, one edge per file from `resolveImport` over its imports. Edges are deduped and sorted by `from`, then `to`.

**`resolveNameToFile(index, fromFile, dotted, importsOf)`** (let `h` = the first segment)
1. **The last `from` import in `fromFile` that binds `h`:**
   - Try `sub = resolveModule(level, module + '.' + name)`. On a hit, `h` is a module: return `{ file: sub, name: segment[1] ?? '' }`, after the one-hop `__init__` re-export rule.
   - Otherwise, let `m = resolveModule(level, module)`; on a hit return `{ file: follow-reexport(m, name), name }`.
2. **Else, an `import` that binds `h`** (`alias === h`, or no alias and `module.split('.')[0] === h`):
   - Find the longest prefix of the full dotted chain (with the alias expanded back to `module`) that `resolveModule` resolves.
   - Return `{ file, name: nextSegment ?? '' }`.
3. **Otherwise** return `null`. The caller checks for local definitions.

**`resolveDottedString(index, dotted)`**: the longest prefix that `resolveModule(…, 0, prefix)` resolves → `{ file, name: nextSegment ?? '' }`, or `null`.

### 3.4 Fact strings (U5 renders, U6/U7 assert, blast displays unchanged)

**Endpoints**
- Format: `"<METHOD> <path>"`. `METHOD` is one of `GET POST PUT PATCH DELETE HEAD OPTIONS ANY`.
- Path normalisation, applied to each fragment:
  - strip a leading `^`, a trailing `$` and leading `/`;
  - join the include prefixes in order;
  - collapse `//+` → `/`;
  - prepend `/`.
  - `''` → `/`. Django converters (`<int:pk>`) are kept verbatim.
- **Django** (`path` / `re_path` / `url`, bare callee):
  - Only in a file that imports that callee name from `django.urls` or `django.conf.urls`.
  - The view is positional arg 1 or `view=`:
    - a name → `expr` target;
    - `X.as_view(...)` → `expr` target `X`;
    - a str → `string` target;
    - `include(...)` → an include reg;
    - `<routerVar>.urls` (where `routerVar` is assigned from a call whose callee ends in `Router`) → a router include;
    - any other `*.urls` (e.g. `admin.site.urls`) → skipped.
- **Method inference** (`viewInfo` of the resolved `{file,name}`):
  - A function with `@api_view([...])` → those methods; `@api_view` without args → `GET`.
  - `@require_http_methods([...])` → those methods.
  - `@require_GET` → `GET`, `@require_POST` → `POST`, `@require_safe` → `GET`, `HEAD`.
  - A class → its methods ∩ {get, post, put, patch, delete, head, options}.
  - Anything else → `ANY`. One fact per method.
- **DRF router** `<routerVar>.register(prefix, viewset, …)`:
  - `ANY <P>/<prefix>/` and `ANY <P>/<prefix>/{pk}/`.
  - For each `@action` of the viewset class: `<METHOD> <P>/<prefix>/<urlPath>/`, or `<P>/<prefix>/{pk}/<urlPath>/` when `detail=True`.
  - `<P>` is the prefix of the `include(<routerVar>.urls)` in the same file, composed with the file's own include prefixes. `urlpatterns += router.urls` means an empty `<P>`.
- **Flask** (the file imports a module starting with `flask`):
  - `@<x>.route(path, methods=[…])`, default `GET`.
  - `@<x>.get|post|put|patch|delete(path)`.
  - The prefix comes from a same-file `<x> = Blueprint(..., url_prefix='…')`.
- **FastAPI** (the file imports a module starting with `fastapi`):
  - `@<x>.get|post|put|patch|delete|options|head(path)` and `@<x>.api_route(path, methods=[…])`.
  - The prefix comes from a same-file `<x> = APIRouter(prefix='…')`.
- **Include composition:**
  - Roots are urlconfs that no other file includes; they use their own paths as written.
  - Walk depth-first with a visited-set per chain and depth ≤ 8.
  - A urlconf included from N places gets N prefixed variants.

**Crons / jobs**
- **Cron string:** `"<schedule> (<label>)"`.
- **Celery `crontab(...)`:** positional order is `minute, hour, day_of_week, day_of_month, month_of_year`; kwargs are the same names. Render the fields as `minute hour day_of_month month_of_year day_of_week`. A missing field is `*`; str and num values are rendered verbatim (the literal's source text, so `300.0` stays `300.0`); any other value is `*`.
- **Other schedules:**
  - A number `N` (verbatim source text) → `every Ns`.
  - `timedelta(<unit>=N)` with exactly one of seconds/minutes/hours/days → `every N<s|m|h|d>`, otherwise `every ?`.
  - Anything else → `schedule`.
- **Celery beat:**
  - Sources:
    - a dict assigned to a target whose last segment lowercased ends with `beat_schedule` (`CELERY_BEAT_SCHEDULE`, `CELERYBEAT_SCHEDULE`, `app.conf.beat_schedule`);
    - the `beat_schedule=` kwarg of any `*.update(...)` call.
  - For each entry `{'task': '<dotted>', 'schedule': <expr>}`: label = the last segment of `task` (or the entry key when `task` is missing), target = `string` target `task`.
  - `<x>.add_periodic_task(schedule, sig, ...)`: the target is an `expr` target of `sig`'s callee with a trailing `.s` / `.si` removed; label = its last segment.
- **`@periodic_task(run_every=<expr>)`** → a local target, label = the function name.
- **APScheduler:**
  - `<x>.add_job(func, 'cron'|trigger='cron', …)`: the cron fields come from kwargs `minute hour day month day_of_week` (rendered in that order, missing → `*`).
  - `'interval'` with `seconds|minutes|hours|days=N` → `every N<unit>`.
  - label = the last segment of `func`, target = `expr` target `func`.
  - `@<x>.scheduled_job('cron'|'interval', …)` → a local target.
- **django-crontab** `CRONJOBS = [('<expr>', '<dotted>'), …]` → `"<expr> (<last segment>)"`, target = `string`.
- **Jobs:**
  - `@shared_task`, `@shared_task(...)`, `@<x>.task` or `@<x>.task(...)` on a module-level function → `job:<label>`.
  - label = the `name=` kwarg string, else the function name.
  - Written to the declaring file only.

**Attribution:** each rendered fact goes to the registering file, and also to `resolver.resolveTarget(file, target).file` when that resolves to a different file. Rows are merged per file (sorted, unique) and empty rows are dropped.

### 3.5 Fixture `server/test/fixtures/django-mini/` (created by U2, exact content)

All files end with a newline. There are 18 files in total: 16 are walked and 2 are under `apps/contacts/migrations/` (not walked).

Empty files: `config/__init__.py`, `apps/__init__.py`, `apps/tools/__init__.py`, `apps/contacts/__init__.py`, `apps/contacts/migrations/__init__.py`, `apps/history/__init__.py`, `apps/reports/__init__.py`.

`manage.py`
```python
#!/usr/bin/env python
import os
import sys


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    from django.core.management import execute_from_command_line

    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
```

`config/settings.py`
```python
from celery.schedules import crontab

ROOT_URLCONF = "config.urls"

CELERY_BEAT_SCHEDULE = {
    "weekly-report": {
        "task": "apps.reports.tasks.send_weekly_report",
        "schedule": crontab(minute=0, hour=7, day_of_week=1),
    },
    "cleanup": {
        "task": "apps.reports.tasks.cleanup",
        "schedule": 300,
    },
}
```

`config/urls.py`
```python
from django.contrib import admin
from django.urls import include, path

from apps.history.views import HistoryListView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", include("apps.contacts.urls")),
    path("api/history/", HistoryListView.as_view(), name="history"),
]
```

`apps/tools/phone.py`
```python
import re

_NON_DIGITS = re.compile(r"\D+")


def _digits(raw):
    return _NON_DIGITS.sub("", raw or "")


def normalize_phone(raw):
    """Return '+' followed by the digits of raw, or '' when there are none."""
    digits = _digits(raw)
    return f"+{digits}" if digits else ""
```

`apps/contacts/models.py`
```python
from django.db import models


class Contact(models.Model):
    name = models.CharField(max_length=100)
    phone = models.CharField(max_length=32)
```

`apps/contacts/serializers.py`
```python
from rest_framework import serializers

from apps.tools.phone import normalize_phone

from .models import Contact


class ContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contact
        fields = "__all__"

    def validate_phone(self, value):
        return normalize_phone(value)
```

`apps/contacts/views.py`
```python
from django.shortcuts import render
from rest_framework import viewsets
from rest_framework.decorators import action, api_view
from rest_framework.response import Response

from apps.tools import phone

from .models import Contact
from .serializers import ContactSerializer


def contact_list(request):
    return render(request, "contacts/list.html", {"contacts": Contact.objects.all()})


@api_view(["GET", "POST"])
def contact_lookup(request):
    return Response({"phone": phone.normalize_phone(request.GET.get("q"))})


class ContactViewSet(viewsets.ModelViewSet):
    queryset = Contact.objects.all()
    serializer_class = ContactSerializer

    @action(detail=False, methods=["post"], url_path="import_csv")
    def import_csv(self, request):
        rows = [phone.normalize_phone(r) for r in request.data.get("phones", [])]
        return Response({"imported": len(rows)})
```

`apps/contacts/urls.py`
```python
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register(r"contacts", views.ContactViewSet, basename="contact")

urlpatterns = [
    path("", views.contact_list, name="contact-list"),
    path("lookup/", views.contact_lookup, name="contact-lookup"),
    path("api/", include(router.urls)),
]
```

`apps/contacts/migrations/0001_initial.py`
```python
from django.db import migrations

from apps.tools.phone import normalize_phone


def forwards(apps, schema_editor):
    normalize_phone("")


class Migration(migrations.Migration):
    dependencies = []
    operations = [migrations.RunPython(forwards)]
```

`apps/history/views.py`
```python
from rest_framework import generics
from rest_framework.response import Response


class HistoryListView(generics.ListAPIView):
    def get(self, request):
        return Response([])
```

`apps/reports/tasks.py`
```python
from celery import shared_task

from apps.tools.phone import normalize_phone


@shared_task
def send_weekly_report():
    return normalize_phone("+1 555 0100")


@shared_task(name="reports.cleanup")
def cleanup():
    return None
```

**Expected facts for the fixture** (asserted by U5, U6 and U7):

| File | endpoints | crons |
|---|---|---|
| `apps/contacts/urls.py` and `apps/contacts/views.py` (identical) | `ANY /`, `ANY /api/contacts/`, `ANY /api/contacts/{pk}/`, `GET /lookup/`, `POST /api/contacts/import_csv/`, `POST /lookup/` | — |
| `config/urls.py` and `apps/history/views.py` | `GET /api/history/` | — |
| `config/settings.py` | — | `0 7 * * 1 (send_weekly_report)`, `every 300s (cleanup)` |
| `apps/reports/tasks.py` | — | `0 7 * * 1 (send_weekly_report)`, `every 300s (cleanup)`, `job:reports.cleanup`, `job:send_weekly_report` |

(Arrays are sorted with the default JS string sort.) No other file has facts. `apps/contacts/migrations/**` is not walked at all.

**Expected Python edges (subset asserted):**
- `apps/contacts/serializers.py → apps/tools/phone.py`
- `apps/contacts/serializers.py → apps/contacts/models.py`
- `apps/contacts/views.py → apps/tools/phone.py`
- `apps/contacts/views.py → apps/contacts/serializers.py`
- `apps/contacts/urls.py → apps/contacts/views.py`
- `config/urls.py → apps/history/views.py`
- `apps/reports/tasks.py → apps/tools/phone.py`

### 3.6 Optional (U8 only, not scheduled by default)

This adds `'unsupported_language'` to `DegradedReason` (`server/src/modules/repo-intel/types.ts:27-32`) and to `BlastDegradedReason` in **both** `server/src/vendor/shared/contracts/review-api.ts` and `client/src/vendor/shared/contracts/review-api.ts`. The orchestrator makes these edits in Wave 0 only if Open question 3 = b.

## 4. Work units

### U1 — Python scanner (outline producer)
| Field | Value |
|---|---|
| Kind | engine (server adapter, pure) |
| Wave | 1 |
| Depends on | Wave 0 (`types.ts`) |
| Owns (create/modify) | `server/src/adapters/python/scan.ts`, `server/test/python-scan.test.ts` |
| Must not touch | `server/src/adapters/python/types.ts`, anything under `src/modules/**`, `adapters/astgrep/**`, `package.json`/lockfile |
| Consumes | §3.1 `PyOutline` and related types |
| Produces | `scanPython(source): PyOutline` (§3.2) |
| Checks | `cd server && pnpm typecheck · pnpm exec vitest run test/python-scan.test.ts · pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known` |

**Steps**
1. **Tokenizer.** Tokens are NAME, NUMBER, STRING, OP, NEWLINE, INDENT and DEDENT, with 1-based line numbers.
   - Strings: `'` `"` and triple quotes, with case-insensitive prefixes `r b u f rb br fr rf`. A string's value is its raw inner text without prefix or quotes; escapes are not decoded except `\\` → `\` and `\'` / `\"`.
   - Numbers keep their verbatim source text.
   - Drop comments.
   - Join lines implicitly inside `()[]{}` and explicitly on a trailing `\`.
   - Indentation: a tab advances to the next multiple of 8. Blank and comment-only lines never change indentation.
2. **Statement layer.** Recognise:
   - decorators (`@expr` lines attach to the next def/class);
   - `def` / `async def` with the header signature;
   - `class` with its header args;
   - `import` / `from … import …` (including the parenthesised multi-line form);
   - assignments (`=`, `+=`, annotated `:`) with plain-name/dotted targets;
   - one-line compound bodies (`def f(): return 1`).
   - Compute `endLine` from the DEDENT that closes the block.
   - Only top-level (not inside a def/class) defs, classes and assignments go into `functions` / `classes` / `assignments`. Class-body defs and assignments go into `PyClass.methods` / `.assignments`.
3. **Expression parser.** A tolerant recursive descent over atoms, name chains, calls (positional, keyword, `*`, `**` args), subscripts, list/tuple/set/dict literals and parenthesised exprs.
   - Binary/unary operators, lambdas, comprehensions and conditional expressions produce `{kind:'other'}` for the whole expression, but **still record every inner call in `calls` and every inner name chain in `nameUses`**.
   - Examples: `[...] + static(...)`, `f"+{x}" if x else ""`.
4. **`nameUses` exclusions** exactly as documented on `PyOutline.nameUses`. `isCall` is true only for a chain that is directly the callee.
5. **Robustness.** Never throw. An unterminated string or bracket is closed at EOF and returns a partial outline. `match` / `case` soft keywords, the walrus operator, `print` with `>>` etc. must not crash the scanner.
6. **Tests** (one `describe` per concern, table-driven where natural):
   - imports (all forms incl. relative, aliases, star, multi-line parenthesised, inside `try`/function);
   - defs/classes/methods/decorators/endLine/async/one-liners/signatures spanning lines;
   - nested defs not at top level;
   - calls with keyword/star args and nested calls;
   - dict/seq literals (the §3.5 `CELERY_BEAT_SCHEDULE` value parses to a `dict` with `crontab` call args);
   - `nameUses` exclusions (def names, params, kwarg names, assignment LHS, import tokens);
   - `nameUses` inclusions (`serializer_class = ContactSerializer`, base classes, decorators, call args `views.contact_list`);
   - strings/comments never produce names;
   - garbage input (`"def ("`, `"x = '''"`, `"(((("`) returns without throwing;
   - a 400 KB synthetic file scans in < 1 s.

**Acceptance criteria**
- [ ] `scanPython` parses every file in §3.5 (U1 may paste the sources into the test inline) into the outline the test asserts: e.g. for `apps/contacts/urls.py`, 2 `from` imports plus 1 relative `from . import views` with `level 1`, `module ''`, `names [{name:'views', alias:null}]`; a `calls` entry with `callee 'router.register'` whose args[1] is `name views.ContactViewSet`; 3 `path` calls.
- [ ] For `apps/contacts/views.py`, `classes[0].methods[0]` is `import_csv` with a decorator call `action` carrying keyword args `detail`, `methods`, `url_path`.
- [ ] No input makes `scanPython` throw (fuzz-style test over 50 random slices of the fixture sources).
- [ ] The file imports only `./types.js` and `node:` builtins; depcruise shows no new violation.

### U2 — Walk scope, extension sets, JS-only depgraph, fixture
| Field | Value |
|---|---|
| Kind | backend |
| Wave | 1 |
| Depends on | none |
| Owns (create/modify) | `server/src/modules/repo-intel/constants.ts` (ext sets + exclusions only; **not** `INDEXER_VERSION`), `server/src/modules/repo-intel/pipeline/walk.ts`, `server/src/adapters/depgraph/index.ts`, `server/test/indexer-walk.test.ts`, `server/test/depgraph-filter.test.ts` (new), `server/test/fixtures/django-mini/**` (new, §3.5) |
| Must not touch | `pipeline/full.ts`, `pipeline/incremental.ts`, `service.ts`, `adapters/astgrep/**`, `adapters/python/**` |
| Consumes | none |
| Produces | `JS_TS_EXT`, `PYTHON_EXT`, `SUPPORTED_EXT` (union), extended `EXCLUDED_DIRS`, `PYTHON_EXCLUDED_DIR_SEGMENTS`, `VENV_MARKER_FILE`; walk returning `.py` files; the fixture |
| Checks | `cd server && pnpm typecheck · pnpm exec vitest run test/indexer-walk.test.ts test/depgraph-filter.test.ts test/indexer-pipeline.test.ts test/astgrep.test.ts · pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known` |

**Steps**
1. In `constants.ts`:
   ```ts
   export const JS_TS_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'] as const;
   export const PYTHON_EXT = ['.py'] as const;
   export const SUPPORTED_EXT = [...JS_TS_EXT, ...PYTHON_EXT] as const;
   ```
   Also:
   - Append `'__pycache__', '.venv', 'venv', '.tox', '.nox', 'site-packages', '.mypy_cache', '.pytest_cache', '.ruff_cache', '.eggs'` to `EXCLUDED_DIRS`.
   - Add `export const PYTHON_EXCLUDED_DIR_SEGMENTS = ['migrations'] as const;` and `export const VENV_MARKER_FILE = 'pyvenv.cfg';`, each with a one-line doc. Per INSIGHTS 2026-09-27, the docs must not contain `**/` inside a block comment.
2. In `walk.ts`:
   - After `readdir(dir)`, if `dir !== root` and the entries contain a file named `VENV_MARKER_FILE`, return without walking it.
   - Skip a `.py` file when any directory segment of its relative path is in `PYTHON_EXCLUDED_DIR_SEGMENTS`. Such files are not counted in `totalCandidates`.
   - Update the header comment.
3. In `depgraph/index.ts`:
   - Import `JS_TS_EXT` instead of `SUPPORTED_EXT`. This is the same baselined from→to edge, so the baseline must not change.
   - Filter `files` to JS/TS **before** building `absPaths`, and return `[]` when none remain.
   - The output filter (`hasSupportedExt`) uses the JS/TS set.
4. Create the fixture exactly as in §3.5.
5. Tests:
   - Fix `indexer-walk.test.ts`'s `writeFileAt` to use `dirname()` (INSIGHTS 2026-09-18).
   - Add cases:
     - `.py` files are returned;
     - `.venv/`, `__pycache__/` and a `myenv/` dir containing `pyvenv.cfg` are skipped;
     - `apps/x/migrations/0001_initial.py` is skipped while `db/migrations/001.ts` is kept;
     - walking `test/fixtures/django-mini` returns exactly the 16 non-migration fixture files.
   - `depgraph-filter.test.ts`: a tmp dir with two TS files (one imports the other) plus two `.py` files. The edges are exactly the one TS edge, and a `.py`-only file list returns `[]`.

**Acceptance criteria**
- [ ] `walkClone(fixtureRoot).files` = the 16 §3.5 files outside `apps/contacts/migrations/`, sorted.
- [ ] Existing TS behaviour unchanged: all previous `indexer-walk` cases pass, and `indexer-pipeline.test.ts` and `astgrep.test.ts` still pass unmodified.
- [ ] `DepCruiseGraph.buildEdges` never passes a non-JS/TS path to `cruise` (asserted by the mixed-dir test).
- [ ] depcruise shows no new violation; `.dependency-cruiser-known-violations.json` is unchanged.

### U3 — Python symbols and references
| Field | Value |
|---|---|
| Kind | engine (server adapter, pure) |
| Wave | 2 |
| Depends on | U1 |
| Owns (create/modify) | `server/src/adapters/python/symbols.ts`, `server/test/python-symbols.test.ts` |
| Must not touch | `scan.ts`, `types.ts`, `src/modules/**`, `adapters/astgrep/**` |
| Consumes | `scanPython` (U1), §3.1 `PySymbol`/`PyReference`, §3.2 symbol and reference rules |
| Produces | `parsePythonSymbols`, `parsePythonReferences`, module constants `PY_KEYWORDS`, `PY_BUILTINS` |
| Checks | `cd server && pnpm typecheck · pnpm exec vitest run test/python-symbols.test.ts · pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known` |

**Steps**
1. Implement both functions over `scanPython`, exactly per the §3.2 rules. `maxSignatureChars` is a parameter, and the file does **not** import `modules/repo-intel/constants.ts` (`adapters-not-into-modules`).
2. Tests use the §3.5 sources inline:
   - `phone.py` → `_digits`, `normalize_phone` (`function`, `exported: true`, signatures `def _digits(raw)` / `def normalize_phone(raw)`).
   - `views.py` → `contact_list`, `contact_lookup`, `ContactViewSet` (`class`), `ContactViewSet.import_csv` and `import_csv` (`method`), with correct `line` / `endLine`.
   - References in `views.py` include `normalize_phone` at the lines of both `phone.normalize_phone(...)` calls, `phone`, `ContactSerializer` (the `serializer_class` line), `Contact`, `render`, `Response`, `action`, `api_view`.
   - `serializers.py` → `normalize_phone` at the `validate_phone` body line.
   - The alias case `from a import b as c; c()` → `b`.
   - Builtins (`len`, `super`, `self.x()` emits only `x`) are excluded, as are declaration lines and import lines.
   - Signature trimming at `maxSignatureChars`.

**Acceptance criteria**
- [ ] Output rows are structurally assignable to the pipeline's `IndexerSymbolRow` / `IndexerReferenceRow` fields (`name, kind, line, endLine, exported, signature` / `toSymbol, line`).
- [ ] Every rule in §3.2 has at least one table-test row.
- [ ] No import from `src/modules/**`; depcruise is clean.

### U4 — Python import resolver and edges
| Field | Value |
|---|---|
| Kind | engine (server adapter, pure) |
| Wave | 1 |
| Depends on | Wave 0 (`types.ts`) |
| Owns (create/modify) | `server/src/adapters/python/imports.ts`, `server/test/python-imports.test.ts` |
| Must not touch | `scan.ts`, `types.ts`, `src/modules/**` |
| Consumes | §3.1 `PyImport`, `PyModuleIndex`, `PyFileEdge`, `PyResolved`, `PyImportsOf`; §3.3 |
| Produces | `buildModuleIndex`, `resolveModule`, `resolveImport`, `buildPythonEdges`, `resolveNameToFile`, `resolveDottedString` |
| Checks | `cd server && pnpm typecheck · pnpm exec vitest run test/python-imports.test.ts · pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known` |

**Steps**
1. Implement §3.3 exactly. The code is pure: no fs, only string/set operations with POSIX paths (`node:path/posix`). The output is deterministic (sorted).
2. Tests build `PyImport` objects by hand (no dependency on U1) over the 16-file §3.5 walk list:
   - `from apps.tools.phone import normalize_phone` → `apps/tools/phone.py`.
   - `from apps.tools import phone` → `apps/tools/phone.py` (the submodule wins).
   - `from . import views` in `apps/contacts/urls.py` → `apps/contacts/views.py`.
   - `from .models import Contact` → `apps/contacts/models.py`.
   - `from django.urls import path` → nothing.
   - Source-root cases:
     - a `backend/manage.py` layout (`backend/apps/x.py` is imported as `apps.x`);
     - a `src/` layout;
     - an ambiguous suffix → `null`.
   - An `__init__.py` one-hop re-export: `pkg/__init__.py` has `from .impl import helper`, and `from pkg import helper` → `pkg/impl.py`.
   - `resolveNameToFile(apps/contacts/urls.py, 'views.ContactViewSet')` → `{file:'apps/contacts/views.py', name:'ContactViewSet'}`.
   - `resolveNameToFile(config/urls.py, 'HistoryListView')` → `{file:'apps/history/views.py', name:'HistoryListView'}`.
   - `resolveDottedString('apps.reports.tasks.send_weekly_report')` → `{file:'apps/reports/tasks.py', name:'send_weekly_report'}`.
   - `resolveDottedString('apps.contacts.urls')` → `{file:'apps/contacts/urls.py', name:''}`.
   - Edges have no self-edges and no duplicates.

**Acceptance criteria**
- [ ] `buildPythonEdges` over hand-written imports of the §3.5 files yields at least the §3.5 edge subset.
- [ ] Unresolvable (third-party) imports never produce an edge.
- [ ] depcruise is clean.

### U5 — Python endpoint / cron / job facts
| Field | Value |
|---|---|
| Kind | engine (server adapter, pure) |
| Wave | 2 |
| Depends on | U1 |
| Owns (create/modify) | `server/src/adapters/python/facts.ts`, `server/test/python-facts.test.ts` |
| Must not touch | `scan.ts`, `imports.ts`, `types.ts`, `src/modules/**`, `adapters/codeindex/**` |
| Consumes | `scanPython` (U1), §3.1 fact types, §3.4 |
| Produces | `extractPythonRegistrations`, `collectViewInfo`, `attributePythonFacts` |
| Checks | `cd server && pnpm typecheck · pnpm exec vitest run test/python-facts.test.ts · pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known` |

**Steps**
1. `extractPythonRegistrations` implements every §3.4 recogniser, including its import precondition (`django.urls` / `django.conf.urls`, `flask*`, `fastapi*`).
   - An `expr` target whose head is a module-level def/class of the same file is emitted as a `local` target.
   - Regexes, if any, use named groups (INSIGHTS 2026-09-27).
2. `collectViewInfo`:
   - Function views → methods from the decorators (§3.4).
   - Classes → the HTTP-verb methods, plus `@action` entries (`detail`, `methods` default `['GET']`, `url_path` default = the method name).
3. `attributePythonFacts`:
   - Compose include prefixes (roots, DFS, visited-set, depth ≤ 8).
   - Render router, action and Django endpoints using the view info of the resolved target.
   - Render crons and jobs.
   - Attribute each fact to the registering file and the resolved target file.
   - Merge the rows per file, sorted and unique.
   - A `local` target resolves to `{file: registeringFile, name}` without calling the resolver.
4. Tests use **a fake `PyFactsResolver`** (a map from `(fromFile, dotted)` to `PyResolved`) so they do not depend on U4. Cases:
   - The full §3.5 fixture sources (inline) with a fake resolver encoding the §3.3 answers produce exactly the §3.5 facts table.
   - Flask: a Blueprint with `url_prefix` and `methods=['GET','POST']`, and the default `GET`.
   - FastAPI: `APIRouter(prefix='/items')` + `@router.post('/')` → `POST /items/`, and `@app.api_route('/x', methods=['PUT'])`.
   - `re_path(r'^ckeditor/upload/*$', V.as_view())` normalisation.
   - The `urlpatterns = ([...] + static(...))` shape (support-platform-fork style).
   - An include cycle terminates.
   - APScheduler `add_job(job, 'cron', hour=3, minute=0)` → `0 3 * * * (job)`, and `'interval', minutes=5` → `every 5m (job)`.
   - `add_periodic_task(10.0, ping.s())` → `every 10.0s (ping)`.
   - `CRONJOBS`.
   - `@app.task(name='invite_member', queue='x')` → `job:invite_member`.
   - Negatives:
     - a `path()` in a file that does not import it from Django → no fact;
     - `os.path.join(...)` → no fact;
     - `admin.site.urls` → no fact.

**Acceptance criteria**
- [ ] The fixture fact table in §3.5 is reproduced exactly (sorted arrays).
- [ ] Every recogniser in §3.4 has a positive and a negative test.
- [ ] Pure: no fs or network; depcruise is clean.

### U6 — Project pass, barrel, and pipeline wiring (plus version bump)
| Field | Value |
|---|---|
| Kind | backend |
| Wave | 3 |
| Depends on | U1, U2, U3, U4, U5 |
| Owns (create/modify) | `server/src/adapters/python/project.ts` (new), `server/src/adapters/python/index.ts` (new barrel), `server/src/modules/repo-intel/pipeline/parse-file.ts` (new), `server/src/modules/repo-intel/pipeline/full.ts`, `server/src/modules/repo-intel/pipeline/incremental.ts`, `server/src/modules/repo-intel/constants.ts` (**only** `INDEXER_VERSION` 2 → 3 and its doc line), `server/test/python-project.test.ts` (new), `server/test/indexer-pipeline.test.ts` |
| Must not touch | `service.ts`, `repository.ts`, `platform/container.ts`, `modules/blast/**`, `adapters/astgrep/**`, `adapters/codeindex/**`, any vendored file, `package.json` |
| Consumes | U1–U5 functions, §3.2, fixture (U2), `JS_TS_EXT`/`PYTHON_EXT` (U2) |
| Produces | `analyzePythonProject`, `isPythonFile`, the barrel; Python-aware `runFullIndex` / `runIncremental`; `INDEXER_VERSION = 3` |
| Checks | `cd server && pnpm typecheck · pnpm exec vitest run --exclude '**/*.it.test.ts' · pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known` |

**Steps**
1. **`project.ts`.** For each `.py` in `files` (stop when `Date.now() > deadlineAt` → `truncated: true`):
   - `readFile(join(root, f), 'utf8')` (on failure → `degraded`), then `scanPython`.
   - Then:
     - `buildModuleIndex(pyFiles)`;
     - `importsOf` = a map lookup;
     - `edges = buildPythonEdges(...)`;
     - `regs = extractPythonRegistrations` per file;
     - `viewInfo = collectViewInfo` per file.
   - The resolver: `local` → the file itself; `expr` → `resolveNameToFile`, and when that is null and the head is a module-level def/class of `fromFile` → `{file: fromFile, name}`; `string` → `resolveDottedString`.
   - `facts = attributePythonFacts(...)`. Never throw.
2. **`index.ts`** re-exports the types plus all functions of §3.2.
3. **`pipeline/parse-file.ts`**:
   - `isIndexable(relPath)` is true when `langForFile(relPath) !== null || isPythonFile(relPath)`.
   - `parseSourceFile(relPath, source)`:
     - `.py` → `{ symbols: parsePythonSymbols(relPath, source, MAX_SIGNATURE_CHARS), references: parsePythonReferences(...), endpoints: [], crons: [] }`;
     - otherwise the existing astgrep `parseSymbols` / `parseReferences` plus `extractEndpoints` / `extractCrons`.
4. **`full.ts`**:
   - Replace the `langForFile` gate (`:137`) and the parse and facts calls (`:155-190`) with `isIndexable` / `parseSourceFile` (same watchdog).
   - In the T3 block (`:214-248`), after the depgraph call, run `analyzePythonProject(clonePath, walk.files, { deadlineAt: startedAt + INDEX_SOFT_BUDGET_MS })` (skipped when there are no `.py` files).
   - Merge: `edgeRows = [...jsEdges, ...pyEdges]` (deduped), and pass `replaceFileFacts(repoId, [...factsBuf, ...py.facts])`.
   - `truncated` → status `partial`, `reason 'python_truncated'`.
   - Add `pythonFiles`, `pythonEdges`, `pythonFacts`, `pythonDegraded` (capped at 50) to `stats`.
   - `py.degraded` does not by itself make the index partial.
5. **`incremental.ts`**:
   - Use `isIndexable` / `parseSourceFile` in the slice loop (`:146-203`). The slice `patchFileFacts` (`:208`) keeps JS/TS rows only; `.py` changed files contribute no slice facts.
   - In the T3 try-block (`:215-239`), run the Python pass over `allFiles` with `deadlineAt: startedAt + INDEX_SOFT_BUDGET_MS`:
     - merge the edges before `replaceEdges`;
     - then `patchFileFacts(repoId, allPyFiles, py.facts)`;
     - apply the same truncated → partial rule.
6. **`constants.ts`**: set `INDEXER_VERSION = 3` and add a doc line: "v3: Python (.py) indexing — symbols/refs, import edges, Django/Flask/FastAPI/Celery facts; bump forces a full reindex on the next refresh/resync".
7. **Tests.**
   - `python-project.test.ts`: `analyzePythonProject(fixtureRoot, (await walkClone(fixtureRoot)).files, { deadlineAt: Date.now() + 60_000 })` returns the §3.5 facts table exactly and the §3.5 edge subset. A deadline already in the past → `truncated: true`, no throw.
   - `indexer-pipeline.test.ts`: extend the stub so `replaceEdges`, `replaceFileFacts` and `patchFileFacts` record their args. Add:
     - a full-index case over a tmp dir holding a 3-file inline Python mini project, asserting Python symbols in `symbols`, a Python edge in `replaceEdges`, a Django endpoint in `replaceFileFacts`, and status `full`;
     - an incremental case where one `.py` file changed, asserting that `patchFileFacts` was called with all `.py` paths and the Python facts.
   - All existing cases stay green.

**Acceptance criteria**
- [ ] A TS-only repo indexes exactly as before: all existing pipeline tests pass unchanged apart from the stub extension.
- [ ] `.py` files never reach `extractEndpoints` / `extractCrons` or `cruise`.
- [ ] `INDEXER_VERSION === 3`. The existing "version mismatch → full" test still passes.
- [ ] depcruise shows no new violation. The new `pipeline/parse-file.ts` → adapters edges and the `adapters/python/*` files add no baseline entries.
- [ ] Unit suite green: `pnpm exec vitest run --exclude '**/*.it.test.ts'`.

### U7 — End-to-end integration test and docs
| Field | Value |
|---|---|
| Kind | backend (test + docs) |
| Wave | 4 |
| Depends on | U6 |
| Owns (create/modify) | `server/test/repo-intel-python.it.test.ts` (new), `server/src/modules/repo-intel/README.md` |
| Must not touch | any `src/**/*.ts`, the fixture (report `BLOCKED:` if it needs changing), `INSIGHTS.md` |
| Consumes | fixture (§3.5), `RepoIntelService`, `buildApp`, `MockGitClient` (`server/src/adapters/mocks.ts:277-279`) |
| Produces | Docker-gated proof that the Python blast works through the facade and the HTTP route |
| Checks | `cd server && pnpm exec vitest run test/repo-intel-python.it.test.ts` (skips without Docker) `· pnpm typecheck` |

**Steps**
1. Follow the `server/test/blast.it.test.ts` and `server/test/pulls-comments.it.test.ts` patterns:
   - `startPg()`, `seed()`, then insert a `repos` row with `clonePath` = the absolute path of `test/fixtures/django-mini`. The indexer only reads the clone, so no copy is needed.
   - Build the config with `repoIntelEnabled: true` and `buildApp({ config, db, overrides: { git: new MockGitClient({ head: 'fixture-sha' }) } })`.
   - Get the service via `new RepoIntelService(container)`, with the container built as `new Container(config, db, { git: new MockGitClient({ head: 'fixture-sha' }) })` (`server/src/platform/container.ts:118`).
2. `it('indexes the Django fixture and serves blast for a changed helper')`:
   - `indexRepo(repoId)` → status `full`; the stored `indexerVersion` is 3.
   - `getBlastRadius(repoId, ['apps/tools/phone.py'])` → `degraded: false`.
   - `changedSymbols` ⊇ `{normalize_phone, _digits}`.
   - `callers` from ≥ 2 distinct files among `apps/contacts/serializers.py`, `apps/contacts/views.py`, `apps/reports/tasks.py`, each with `line > 0`. No caller path contains `/migrations/`.
   - `impactedEndpoints` ⊇ `['ANY /', 'POST /api/contacts/import_csv/', 'GET /lookup/']`.
   - `factsByFile['apps/reports/tasks.py'].crons` contains `0 7 * * 1 (send_weekly_report)`.
3. `it('GET /pulls/:id/blast returns the Python map')`:
   - Insert a PR and a `pr_files` row `apps/tools/phone.py` for the same repo.
   - `app.inject({ method: 'GET', url: '/pulls/<id>/blast' })` → 200.
   - `downstream[0].symbol === 'normalize_phone'`, `stats.callers >= 2`, `stats.endpoints >= 1`, `stats.crons >= 1`, `degraded === false`.
4. **README:**
   - Add a "Languages" section: TS/JS via ast-grep + dependency-cruiser; Python via `adapters/python` (scanner, resolver, facts).
   - Document the §3.4 fact formats, the exclusions (Decision 11), the source-root rules and the `INDEXER_VERSION` reindex trigger (next refresh/resync).
   - Update the mermaid chart node labels.

**Acceptance criteria**
- [ ] With Docker, both tests pass. Without Docker, the suite is skipped (same gate as `blast.it.test.ts:12-18`).
- [ ] The README documents every decision that changes observable behaviour (formats, exclusions, reindex trigger).

### U8 — (optional, off by default) `unsupported_language` degraded reason
| Field | Value |
|---|---|
| Kind | backend + ui |
| Wave | 5 (only if Open question 3 = b) |
| Depends on | U6; Wave 0 contract edit §3.6 |
| Owns (create/modify) | `server/src/modules/repo-intel/types.ts`, `server/src/modules/blast/domain/degradation.ts`, `server/test/blast-domain.test.ts`, `client/messages/en/blast.json` |
| Must not touch | the vendored contracts (Wave 0 owns them) |
| Consumes | §3.6 |
| Produces | Blast reports `unsupported_language` when the repo's index has `filesIndexed === 0` and `stats.reason === 'no_files'` |
| Checks | `server: pnpm typecheck · pnpm exec vitest run test/blast-domain.test.ts` · `client: pnpm typecheck · pnpm test` |

**Steps**
1. Add the union member.
2. In `resolveDegradation`, map a `partial` index with reason `no_files` to `unsupported_language`. This needs `IndexState.reason`, already projected at `repository.ts:214`.
3. Add the i18n string. Update the tests.

**Acceptance criteria**
- [ ] A Go-only repo shows "unsupported language" instead of "partial index".
- [ ] DET-003 is accepted with a reason for the vendored edit.

## 5. Waves (execution order)

| Wave | Units | Runs | Why this order |
|---|---|---|---|
| 0 | Orchestrator: create branch `feat/repo-intel-python` from `L04`; write `server/src/adapters/python/types.ts` verbatim from §3.1. **Only if Open question 1 = a:** `cd server && pnpm add @ast-grep/lang-python@0.0.6` (allow its build), and add `'@ast-grep/lang-python'` to `SDKS` in `server/.dependency-cruiser.cjs`. **Only if Open question 3 = b:** the §3.6 vendored edits in both copies | sequential | Every unit compiles against `types.ts`; deps are never touched by implementers |
| 1 | U1, U2, U4 | parallel | Disjoint files. U4 tests hand-build `PyImport` and do not need U1 |
| 2 | U3, U5 | parallel | Both need `scanPython` (U1); disjoint files |
| 3 | U6 | single | Glue: needs U1–U5 and the fixture; owns the pipeline and the version bump |
| 4 | U7 | single | Needs the wired pipeline |
| 5 | U8 (optional) | single | Only if chosen |

Serialized files: `server/src/modules/repo-intel/constants.ts` is owned by U2 in Wave 1 (ext sets/exclusions) and by U6 in Wave 3 (only `INDEXER_VERSION`). These are different waves, so this is allowed. None of the other serialized files are touched: `modules/index.ts`, migrations, `client/src/lib/api.ts`, messages (only U8), vendor (only Wave 0 for U8), `INSIGHTS.md`.

## 6. Test plan

| Package | Test | Kind | Owner |
|---|---|---|---|
| server | `test/python-scan.test.ts` | pure unit | U1 |
| server | `test/indexer-walk.test.ts` (extended), `test/depgraph-filter.test.ts` | unit (tmp fs, fixture) | U2 |
| server | `test/python-imports.test.ts` | pure unit | U4 |
| server | `test/python-symbols.test.ts` | pure unit | U3 |
| server | `test/python-facts.test.ts` | pure unit (fake resolver) | U5 |
| server | `test/python-project.test.ts`, `test/indexer-pipeline.test.ts` (extended) | unit (fixture / tmp fs, in-memory repo stub) | U6 |
| server | `test/repo-intel-python.it.test.ts` | Docker-gated `*.it.test.ts` (facade + `GET /pulls/:id/blast`) | U7 |
| server | existing `astgrep.test.ts`, `blast-*.test.ts`, `repo-intel-*.test.ts` | regression, unchanged | all |
| client / mcp / e2e | none | — | — |

## 7. Verification (orchestrator, after merge)

**Automated**
```bash
cd server
pnpm typecheck
pnpm exec vitest run --exclude '**/*.it.test.ts'
pnpm exec vitest run .it.test          # needs Docker
pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known
```
Then run `/pr-self-review`.

**Manual scenario (the user's real repos)**
1. `./scripts/dev.sh --no-seed` (never `docker compose down -v`).
2. Studio → repo `humen-dev/contact-book` → click resync, i.e. `POST /repos/:id/resync`. `INDEXER_VERSION` 3 ≠ 2 forces a full reindex (`incremental.ts:78`).
3. `GET /repos/:id/index-state`. Expect:
   - `status: "full"` and `indexerVersion: 3`;
   - `filesIndexed` ≥ 40 (the local clone has ~50 `.py` files outside `migrations/`);
   - `stats.pythonFiles > 0`, `stats.edgesWritten > 0`, `stats.factsWritten > 0`.
4. Open PR #30 → Overview → Blast radius card.
   - For changed files that exist on the default branch (e.g. `apps/contacts/serializers.py` or `views.py`), expect:
     - changed symbols (e.g. `ContactsSerializer`, `CSVUploadSerializer`, `validate_file`);
     - callers in `apps/contacts/views.py` (`ContactsViewSet` / `import_csv`) as `file:line` links;
     - endpoints from `views.py` facts, e.g. `ANY /api/contacts/`, `GET /api/contacts/export/`, `POST /api/contacts/import_csv/`, `POST /api/contacts/{pk}/export_to_gsheet/`, `ANY /`.
   - A file **added** by the PR (e.g. `apps/tools/phone.py`) shows no symbols (Open question 4).
   - If the card is empty, check `pr_files` for the PR and whether those paths exist in `server/clones/humen-dev/contact-book`.
5. Optional: resync `humen-dev/support-platform-fork`.
   - Expect `job:invite_member` / `job:check_operator` facts on the `tasks.py` files.
   - Expect endpoints such as `ANY /companies/...` composed from `support_system/urls.py`'s includes.
   - Expect the JS/Vue half to still produce TS edges (mixed repo).
6. MCP: `get_blast_radius("humen-dev/contact-book", 30)` returns the same map as the card.

## 8. Risks

| Risk | How it shows up | Mitigation |
|---|---|---|
| Scanner misparses exotic syntax (nested f-strings, `match`, very long continuation lines) | Missing symbols/refs for one file; never a crash | Tolerant design + fuzz test (U1). Blast degrades per file, not per repo. Option (a) stays available |
| Recall-first references create false caller edges | Wrong caller shown | Resolution needs an import edge + a unique exported declaration (`repository.ts:400-425`). Same precision gate as TS |
| Urlconf attribution over-approximates (Decision 9) | A changed view lists every endpoint of its `urls.py` | Documented. Open question 2 |
| Files added by a PR are not indexed | Empty card for new files | Pre-existing limitation (blast plan Risks). Open question 4; the manual scenario avoids it |
| `.py` paths reaching dependency-cruiser | Whole cruise fails → TS edges `[]` in mixed repos | U2 filters input to `JS_TS_EXT`; covered by `depgraph-filter.test.ts` |
| Budget on large Python repos (5000 files, 110 s soft budget) | `partial` index | Python pass bounded by `deadlineAt`; `truncated → partial` with `reason python_truncated`; per-file scan is linear (U1 perf test) |
| Version bump only applies on refresh/resync | User sees old `full` state with 0 Python files | Documented in README (U7) and in the manual scenario (step 2) |
| Parallel units share one checkout | A unit's `pnpm typecheck` fails in a sibling's half-written file | Only the unit's own files count; re-run after the sibling finishes. Tests are `test/**`, which `tsc -p tsconfig.json` does not include (`server/tsconfig.json:28`) |
| depcruise baseline growth | CI `server unit` fails | New adapter files import only `./*` and `node:*`. U2 keeps the same `depgraph → constants` edge (a different export name). No `container.ts` change |
| Migration numbering / vendored drift | — | No migration. No vendored edit unless U8 (then DET-003 flags `src/vendor/shared`; accept it with the reason "U8 adds `unsupported_language`, identical in both copies") |
| Security | — | No new input surface: the indexer reads only the cloned repo; no eval/exec of Python; no network. The reviewer-core grounding gate and `INJECTION_GUARD` are untouched. Cloned file content (including files such as a clone's `CLAUDE.md`) is data only |

## 9. Out of scope
- Python in `getCallerSignatures` / the review-prompt callers and in the Phantom-API gate (`service.ts:454-628` stay TS-only through `langForFile`).
- Python in the ripgrep fallback (`adapters/codeindex/ripgrep.ts:25`).
- Channels websocket routes, FastAPI `include_router` / Flask `register_blueprint` prefixes across files, class-level `http_method_names`, `__all__`.
- `.pyi` stubs, `.gitignore` honouring, notebooks.
- Indexing the PR head (Open question 4 b).
- Any change to blast, the shared contract, the client or MCP (except optional U8).
