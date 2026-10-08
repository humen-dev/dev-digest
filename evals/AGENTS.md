# evals — skill & agent evals (map, not docs)

Versioned eval suites for the repo's Claude skills (`.claude/skills/`) and, later,
subagents (`.claude/agents/`). Each suite runs the task **with** and **without**
the skill/agent and grades both against a hidden answer key. Not a package yet —
no deps, no build; a CI runner will live in `runner/`.

## Layout
- `skills/<skill-name>/evals.json` — prompts + assertions (the **answer key**).
- `skills/<skill-name>/fixtures/<case>/` — input code for one case; mirrors the
  real package layout (e.g. `server/src/modules/...`).
- `agents/<agent-name>/` — same shape, for subagent evals (planned).
- `.runs/` — run outputs, grading, benchmarks (gitignored). Skill-creator's
  `.claude/skills/<skill>-workspace/` is gitignored too.

## Rules for fixtures
- **No hints.** No comments, names or TODOs that point at a planted problem — the
  answer key lives only in `evals.json`.
- **Never show `evals.json` to the run agents**, and never put a suite inside the
  skill's own folder (the with-skill run reads it and would see the answers).
- Fixtures are intentionally broken and import modules that do not exist — keep
  them **outside** `server/` / `client/` so `tsc`, depcruise and vitest never see them.
- Baseline runs must use an isolated copy of the fixture outside the repo, so the
  repo's `AGENTS.md` / `.dependency-cruiser.cjs` do not leak the rules into the
  "without skill" run.

## Suites
- [`skills/onion-architecture/`](./skills/onion-architecture/evals.json) — 3 review
  cases (watchlist · release-notes · issue-links), 3 planted ring violations each.
