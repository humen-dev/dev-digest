# `repo-intel` — the codebase indexer

`repo-intel` reads a cloned repository **once on clone** (and incrementally on
fetch, keyed by file content hash) and turns it into queryable facts: symbols,
the import graph, a PageRank-based file importance score, and a compact **repo
map** (the project skeleton). On a review it is only **read** — the index is
already computed, so adding context to a prompt costs no analysis at request time.

This is **starter infrastructure**: it works from day 1 (the **Indexed** badge),
but you don't write it. Course lessons build features _on top_ of its facade —
Blast Radius (L04), Conventions samples (L02), Onboarding reading-path (L05),
the Phantom-API gate (L06) — by calling `repoIntel.*`, not by re-indexing.

## Pipeline

```mermaid
flowchart LR
  CLONE["git clone / fetch"] --> WALK["walk.ts<br/>discover source files (INDEXED_EXT)"]
  WALK --> AST["ast-grep (TS/JS) + adapters/python (.py)<br/>symbols + references + facts"]
  AST --> EDGES["import graph<br/>(dependency-cruiser · Python resolver)"]
  EDGES --> RANK["rank.ts<br/>PageRank + git hotness → file rank"]
  RANK --> MAP["repo-map.ts<br/>compact repo skeleton (cached)"]
  AST --> DB[("Postgres<br/>symbols · references · file_edges · file_rank · repo_map_cache")]
  EDGES --> DB
  RANK --> DB
  MAP --> DB
```

Full vs incremental indexing lives in `pipeline/{full,incremental}.ts`; an
unindexed or partially-indexed repo degrades gracefully (the facade returns empty
results rather than throwing).

## Languages

- **TS/JS** — parsed by ast-grep, import edges from dependency-cruiser. The
  parsed set is `SUPPORTED_EXT` (`.ts .tsx .js .jsx .mjs .cjs`).
- **Python** — `.py` files are handled in-process by `adapters/python`: a scanner
  (symbols + references), an import resolver (`file_edges`) and a facts extractor
  (endpoints and crons). No external binary is needed.
- The **walk scope** is `INDEXED_EXT` (`SUPPORTED_EXT` + `.py`). Never widen
  `SUPPORTED_EXT` for a new language: that would send its files to ast-grep.

### Python facts (`file_facts`)

- **Endpoints** are `METHOD /path` strings from Django (`urls.py`, DRF routers and
  `@action`), Flask and FastAPI routes. `ANY` means the method is not known
  (e.g. a plain Django `path()`); path params render as `{pk}`.
- **Crons** are: `<cron expr> (<task>)` for Celery beat schedules and
  `every <N>s (<task>)` for interval schedules; `job:<name>` for Celery
  `@shared_task`/`@app.task` and APScheduler jobs. Arrays are sorted with the
  default JS string sort.
- Urlconf attribution over-approximates: a changed view lists every endpoint of
  its `urls.py` (consistent with per-file attribution for TS).

### Exclusions and source roots

- `migrations/` directories are not walked at all; virtualenvs (a directory with
  `pyvenv.cfg`), `__pycache__`, `.venv`, `venv`, `.tox`, `site-packages` and the
  other `EXCLUDED_DIRS` are skipped.
- Import resolution tries source roots in order: the directory of each
  `manage.py` (shallowest first), then `src/` when present, then the repo root.
  An import that resolves to no indexed file creates no edge.

### Limitations

- Files **added by a PR** are invisible: the index reflects the indexed head, so
  a new `.py` file has no symbols or edges until the next refresh/resync.
- `INDEXER_VERSION` is **4** (Python indexing). Repos indexed at an older version
  are only rebuilt on the **next refresh/resync** (the version check runs before
  the "sha unchanged" exit); until then they keep 0 Python files.

## Facade (`repoIntel.*`)

Everything downstream reads through one facade (`service.ts`) so consumers never
touch the pipeline internals:

- `getRepoMap(repoId)` → the cached repo skeleton (fed into the **review prompt**).
- `getFileRank(repoId, files)` → importance percentile per changed file.
- `getCallerSignatures(repoId, files, limit)` → callers of changed symbols.
- `getBlastRadius(repoId, files)` → impacted symbols / callers (used by L04).
- `getUnresolvedReferences(repoId, …)` → phantom-symbol detection (used by L06).
- `getConventionSamples(repoId)` → top-ranked files for convention extraction (L02).

In the starter, only `getRepoMap` / `getFileRank` / `getCallerSignatures` are
wired — into `modules/reviews/run-executor.ts`, which adds the repo map and a
high-blast-radius note to the prompt. Toggled by `REPO_INTEL_ENABLED` (global)
and a per-agent `repo_intel` flag.

## Routes

- `GET /repos/:id/index-state` — index status (drives the **Indexed** badge).
- `POST /repos/:id/resync` — enqueue a re-index.
