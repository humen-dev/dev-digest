# Workflow retro ledger

One row per `/workflow-retro` run, so multi-agent runs of the same kind can be compared over time.
Rows are appended by the skill (`.claude/skills/workflow-retro`); numbers come from
`retro-tools.mjs analyze` (tokens de-duplicated per API message, nested agents included).
Cost uses per-model rates verified via the `claude-api` skill at retro time — `n/a` when not priced.

| date | label | kind | agents | out tok | cache-read | cache hit | wall s | parallelism | cost $ | outcome | top recommendation |
|------|-------|------|--------|---------|------------|-----------|--------|-------------|--------|---------|--------------------|
