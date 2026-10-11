# evals — skill, agent & workflow evals (map, not docs)

`@devdigest/evals` — evals for the repo's Claude Code harness: skills (`.claude/skills/`),
subagents (`.claude/agents/`) and workflow-level behaviour (`CLAUDE.md` / `AGENTS.md` /
settings). Standalone **pnpm** package: vitest + the Claude Agent SDK. Full docs:
[README.md](./README.md).

## Two eval formats — know which one you are touching
- **vitest suites (`*.eval.ts` + `*.cases.ts`)** — the engine in `src/`; what CI runs.
  Local runs use the Claude Code subscription; CI uses OpenRouter (`EVAL_PROVIDER=openrouter`).
- **skill-creator suites (`evals.json`)** — answer key + hint-free fixtures, run by hand with
  the `skill-creator` skill (with vs without the skill). CI does **not** run them: a dir counts
  as having evals only if it holds a `*.eval.ts`.

## Commands (run inside `evals/`)
- `pnpm typecheck` · `pnpm eval:quality` (static SKILL.md gate, no model)
- `pnpm vitest run skills/<name>/` · `agents/<name>/` · `workflow/` — model evals
- `pnpm eval:repeat` / `eval:delta` / `eval:benchmark` — stability, version diff, lift
- `pnpm tsx src/ci/select-cli.ts --base main` — which suites CI would run for this branch

## Layout
- `src/` — the engine (runtime, scoring, records, `ci/` selection). Eval files import only
  from the barrel `src/index.ts`.
- `skills/<name>/`, `agents/<name>/` — `*.eval.ts` + `*.cases.ts` + `fixtures/`, and/or an
  `evals.json` suite. `agents/<dir>/variants.json` lists extra agents the dir's cases grade.
- `workflow/` — real-harness evals (skill activation, subagent dispatch, context reach).
- `proxy/litellm.config.yaml` — the LiteLLM translating proxy CI runs OpenRouter models through.
- `results/` (vitest records) and `.runs/` (skill-creator runs) — gitignored, safe to delete.
  Skill-creator's `.claude/skills/<skill>-workspace/` is gitignored too.

## CI
Three PR pipelines — `eval-skills.yml`, `eval-agents.yml`, `eval-workflow.yml` — each a thin caller of the
reusable `.github/workflows/evals.yml` (`suite: skills|agents|workflow`): per-PR, only the suites the diff touches — one check per skill /
agent plus `workflow`. Model jobs are non-blocking. Models, proxy and limits: README → CI.

## Rules for fixtures
- **No hints.** No comments, names or TODOs that point at a planted problem — the answer key
  lives only in `*.cases.ts` / `evals.json`.
- **Never show `evals.json` to the run agents**, and never put a suite inside the skill's own
  folder (the with-skill run reads it and would see the answers).
- Fixtures are intentionally broken and import modules that do not exist — keep them under
  `fixtures/` (excluded from `tsc`) and **outside** `server/` / `client/` so depcruise never
  sees them.
- Baseline runs must use an isolated copy of the fixture outside the repo, so the repo's
  `AGENTS.md` / `.dependency-cruiser.cjs` do not leak the rules into the "without skill" run.

## Suites
- [`skills/dependency-checker/`](./skills/dependency-checker/) — vitest: quality + script contract.
- [`skills/onion-architecture/`](./skills/onion-architecture/evals.json) — skill-creator: 7 review
  cases, planted ring violations (watchlist · release-notes · issue-links · retention ·
  review-sync · pr-digest · skill-audit).
- [`agents/architecture-reviewer/`](./agents/architecture-reviewer/) — vitest; also grades
  `architecture-reviewer-lite`.
- [`workflow/`](./workflow/) — dependency-checker activation, repo context reach, dispatch.
