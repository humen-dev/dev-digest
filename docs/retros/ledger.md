# Workflow retro ledger

One row per `/workflow-retro` run, so multi-agent runs of the same kind can be compared over time.
Rows are appended by the skill (`.claude/skills/workflow-retro`); numbers come from
`retro-tools.mjs analyze` (tokens de-duplicated per API message, nested agents included).
Cost uses per-model rates verified via the `claude-api` skill at retro time — `n/a` when not priced.

| date | label | kind | agents | out tok | cache-read | cache hit | wall s | parallelism | cost $ | outcome | top recommendation |
|------|-------|------|--------|---------|------------|-----------|--------|-------------|--------|---------|--------------------|
| 2026-10-06 | spec-project-context | spec | 3 | 150387 | 30813670 | 96% | 1239.4 | 1.04 | 15.9321 | SPEC-01 approved (70 AC) after 5 spec-creator rounds; main incl. skill build + retro | Ask for design source code + reference impl in the first Spec review (3 of 5 rounds came from late inputs) |
