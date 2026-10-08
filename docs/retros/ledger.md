# Workflow retro ledger

One row per `/workflow-retro` run, so multi-agent runs of the same kind can be compared over time.
Rows are appended by the skill (`.claude/skills/workflow-retro`); numbers come from
`retro-tools.mjs analyze` (tokens de-duplicated per API message, nested agents included).
Cost uses per-model rates verified via the `claude-api` skill at retro time — `n/a` when not priced.

| date | label | kind | agents | out tok | cache-read | cache hit | wall s | parallelism | cost $ | outcome | top recommendation |
|------|-------|------|--------|---------|------------|-----------|--------|-------------|--------|---------|--------------------|
| 2026-10-06 | spec-project-context | spec | 3 | 150387 | 30813670 | 96% | 1239.4 | 1.04 | 15.9321 | SPEC-01 approved (70 AC) after 5 spec-creator rounds; main incl. skill build + retro | Ask for design source code + reference impl in the first Spec review (3 of 5 rounds came from late inputs) |
| 2026-10-07 | impl-onboarding-tour | impl | 34 | 661023 | 215056695 | 97% | 11333.8 | 1.76 | n/a | SPEC-03 built in 4 waves; plan-verifier PASS 293/0; PR #12 CI green after manual-test (M-1..3) and CI (#11) fixes | Implementers read only their unit file + the §3 slice, never the whole plan (plan re-read 20x by 18 agents, ~228k tok) |
| 2026-10-07 | pr-brief | impl | 25 | 331101 | 168411838 | 98% | 4282.7 | 1.35 | 57.334 | SPEC-04 built in 4 waves; plan-verifier 367 MET / 0 open; arch+security approve; merged into PR #11, CI green after 3 e2e fixes | Orchestrator never cd's in Bash: Wave 1 implementers inherited .claude/.impl as cwd (68 guard denials, 6 extra resumes) |
