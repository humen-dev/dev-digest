# e2e — INSIGHTS

Running log of **non-obvious** learnings the code doesn't reveal on its own:
flaky-flow causes, agent-browser quirks, seeding assumptions, sharp edges to
avoid. Linked (not preloaded) from [`CLAUDE.md`](./CLAUDE.md) — read on demand.

> Not for: standard rules or file-by-file description (Claude reads the code).
> One insight per bullet; newest on top. Date each entry so stale ones are easy
> to prune.

## What Works
_(none yet)_

## What Doesn't Work
- 2026-10-07 — NEVER seed before installing reviewer-core's deps in CI. `server/src/db/seed.ts:8` imports `renderProjectContext` from `@devdigest/reviewer-core`, which resolves to its RAW source and imports `openai`. With `npm ci` in `reviewer-core` placed after `pnpm db:seed`, every flow failed before starting (`ERR_MODULE_NOT_FOUND: Cannot find package 'openai'`). ALWAYS keep the "Install reviewer-core deps" step before seeding (`.github/workflows/e2e-web.yml:71`). On a red `browser flows` job, `gh run download <run> -n e2e-failure` gives the failing screenshot.
- 2026-10-06 — NEVER run `./scripts/e2e.sh` while the dev web app is running unless you will restart it: the script starts a second `next dev` in the same `client/` dir (`scripts/e2e.sh:148`), both servers write `client/.next`, and after teardown the dev server on `:3000` serves a stale manifest → `Runtime ChunkLoadError: Loading chunk app/repos/[repoId]/pulls/[number]/page failed`. Fix: restart `pnpm dev` (delete `client/.next` if it persists). Also on Windows a native PostgreSQL install can already listen on the default e2e port 5433, so the isolated migrate hits it and fails with `password authentication failed for user "devdigest"` — run `E2E_PG_PORT=5440 E2E_API_PORT=3201 E2E_WEB_PORT=3200 ./scripts/e2e.sh` (`scripts/e2e.sh:8,27`).
- 2026-09-23 — The conventions seed block is guarded by "this repo has NO conventions yet" (`server/src/db/seed.ts:599`), so on any DB where a real Run Scan (or a triage click) already wrote rows, re-seeding silently leaves the old board in place — and `11-conventions` asserts exact seeded strings ("3 of 3 accepted", the `5 proposed · 1 dropped without evidence · …` counter line, `Detected from 11 sample files`) that then never appear. NEVER debug that flow against a dev DB; run it under the hermetic stack (fresh Postgres) or drop the repo's `conventions` rows first. Same trap for any future flow reading a conditionally-seeded table: check the `if (existing.length === 0)` guard before trusting `db:seed` to restore the fixture (`e2e/specs/11-conventions.flow.json:16`).
- 2026-09-23 — A flow step can encode a route's *navigation* behavior as a pass condition, so a client-only UX change silently breaks flows that look unrelated. Both `08-skills` and `09-skill-versions` opened `{BASE}/skills` and then asserted `["wait", "--url", "/skills/"]` labelled "redirected to a skill's detail route"; dropping `/skills`'s auto-redirect-to-first-skill makes that wait hang — and `09` never cared about the list at all, it just piggy-backed on the redirect to land on a detail route. ALWAYS `rg '"--url"' e2e/specs` for the route you are changing, and replace a redirect wait with an explicit `wait --text <list marker>` → `find text … click` → `wait --url` sequence (`e2e/specs/08-skills.flow.json:5`, `e2e/specs/09-skill-versions.flow.json:5`). Cheap tell while reviewing specs: any step labelled "redirected to …" is an assertion the client can invalidate without touching `e2e/`.
- 2026-09-22 — On Windows, `run.ts`'s `spawn(AGENT_BROWSER_BIN, ...)` (no `shell: true`) cannot launch the installed `agent-browser` CLI either way: the bare shim (`npm i -g agent-browser`'s extensionless file, a `#!/bin/sh` POSIX script) gives `spawn agent-browser ENOENT` since Node's Windows spawn doesn't interpret shebangs or try `PATHEXT`; pointing `AGENT_BROWSER_BIN=agent-browser.cmd` at the batch shim instead gives `spawn EINVAL`, a known Node behavior for spawning `.cmd`/`.bat` directly without `shell: true`. Neither `npm run e2e:hermetic` (invoked via Windows `cmd`, which also chokes on the `../scripts/e2e.sh` package.json script — `'..' is not recognized as an internal or external command`) nor a direct `npx tsx run.ts` from Git Bash gets past this. Verified the flows themselves are correct by running the equivalent steps manually in the browser instead (see `docs/skill-fixtures` skills flows, 2026-09-22). If Windows CI/dev support for this runner is ever needed, `run.ts` would need `shell: true` (or an explicit `cmd /c` wrapper) for the spawn call — not attempted here since it's outside this session's scope and changes a shared runner file.

## Codebase Patterns
_(none yet)_

## Tool & Library Notes
- 2026-10-07 — The flow runner has no absence or disabled-state assertion: only `wait --url`, `wait --text` and `find … click|type` are allowed (`e2e/specs/flows.md`), so "no Open button" or "Regenerate is disabled" cannot be asserted in a flow. ALWAYS assert the positive text that proves the state, e.g. flow 16 waits for "Clone the repository to regenerate" (`e2e/specs/16-onboarding-tour.flow.json`), and cover the negative half in RTL (`TourHeader.test.tsx`, `PathRef`/`CriticalPaths` tests).
- 2026-09-27 — A `find … click` on an element **below the fold** of CI's 1280×577 viewport reports ✓ but does nothing: flow 13's collapsed Boilerplate group header never expanded, and the failure screenshot was still scrolled to the top (runs 36344014397, 36344301503). Adding `["scrollintoview", "<css>"]` right before the click fixed it (run 36344701455, 12/12). Scroll first for anything that is not in the first screen, and scroll back before clicking controls at the top again — see `e2e/specs/13-smart-diff.flow.json:21-25`, which targets the header by its ARIA attribute (`[aria-controls="role-group-boilerplate"]`).
- 2026-09-27 — `agent-browser find text "<X>" click` is a **case-insensitive substring** match that clicks the **first** hit in DOM order, and the step still reports ✓ even when that hit is the wrong element. The sidebar renders before page content, so `find text "Skills" click` on an agent page clicked the sidebar "Skills" link (flow 10 landed on `/skills`), and tab/button clicks in flows 09/11 never toggled the UI — all 4 failed in CI on `main` for days. For any button or tab use `find role button click --name "<label>" --exact` (flow `05-pr-diff` / `10-agent-skills-tab.flow.json`); keep `find text` for unique row/card titles, ideally with `--exact`.

## Recurring Errors & Fixes
_(none yet)_

## Session Notes
_(none yet)_

## Open Questions
_(none yet)_
