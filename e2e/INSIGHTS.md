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
- 2026-09-23 — A flow step can encode a route's *navigation* behavior as a pass condition, so a client-only UX change silently breaks flows that look unrelated. Both `08-skills` and `09-skill-versions` opened `{BASE}/skills` and then asserted `["wait", "--url", "/skills/"]` labelled "redirected to a skill's detail route"; dropping `/skills`'s auto-redirect-to-first-skill makes that wait hang — and `09` never cared about the list at all, it just piggy-backed on the redirect to land on a detail route. ALWAYS `rg '"--url"' e2e/specs` for the route you are changing, and replace a redirect wait with an explicit `wait --text <list marker>` → `find text … click` → `wait --url` sequence (`e2e/specs/08-skills.flow.json:5`, `e2e/specs/09-skill-versions.flow.json:5`). Cheap tell while reviewing specs: any step labelled "redirected to …" is an assertion the client can invalidate without touching `e2e/`.
- 2026-09-22 — On Windows, `run.ts`'s `spawn(AGENT_BROWSER_BIN, ...)` (no `shell: true`) cannot launch the installed `agent-browser` CLI either way: the bare shim (`npm i -g agent-browser`'s extensionless file, a `#!/bin/sh` POSIX script) gives `spawn agent-browser ENOENT` since Node's Windows spawn doesn't interpret shebangs or try `PATHEXT`; pointing `AGENT_BROWSER_BIN=agent-browser.cmd` at the batch shim instead gives `spawn EINVAL`, a known Node behavior for spawning `.cmd`/`.bat` directly without `shell: true`. Neither `npm run e2e:hermetic` (invoked via Windows `cmd`, which also chokes on the `../scripts/e2e.sh` package.json script — `'..' is not recognized as an internal or external command`) nor a direct `npx tsx run.ts` from Git Bash gets past this. Verified the flows themselves are correct by running the equivalent steps manually in the browser instead (see `docs/skill-fixtures` skills flows, 2026-09-22). If Windows CI/dev support for this runner is ever needed, `run.ts` would need `shell: true` (or an explicit `cmd /c` wrapper) for the spawn call — not attempted here since it's outside this session's scope and changes a shared runner file.

## Codebase Patterns
_(none yet)_

## Tool & Library Notes
_(none yet)_

## Recurring Errors & Fixes
_(none yet)_

## Session Notes
_(none yet)_

## Open Questions
_(none yet)_
