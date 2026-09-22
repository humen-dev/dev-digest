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
