# specs — cross-module specifications

Behaviour **specifications** for features that span **two or more modules**
(`client`, `server`, `reviewer-core`, `mcp`). A feature that lives in one module
keeps its spec in that module's `specs/` folder instead; nothing else belongs here.

- Written by the [`spec-creator`](../.claude/agents/spec-creator.md) agent from the
  template [`_TEMPLATE.md`](./_TEMPLATE.md), consumed by `implementation-planner`.
- File name: `YYYY-MM-DD-<feature-slug>.md` (creation date + feature name).
- `Spec ID: SPEC-NN` is **global** across every `specs/` folder in the repository
  (next free number = highest existing ID + 1) — IDs are never reused.
- Status lifecycle: `draft` → `approved` (user decision) → `implemented`; a spec
  replaced by a newer one becomes `superseded` with a `Superseded by` link — its
  body is never rewritten. Approved and implemented specs change only through a
  new spec that `Supersedes` them.
- Acceptance criteria use EARS (`WHEN` / `WHILE` / `IF … THEN` / `WHERE` + `shall`).

## Index
- [2026-10-06-project-context.md](./2026-10-06-project-context.md) — SPEC-01 · implemented · attach repo Markdown docs to agents/skills; edit docs in the clone; injected in full as untrusted `## Project context` (working tree) and shown in the run trace
- [2026-10-06-onboarding-tour.md](./2026-10-06-onboarding-tour.md) — SPEC-02 · superseded by SPEC-03 · per-repo five-section Onboarding Tour (background generation, path-aware staleness)
- [2026-10-06-onboarding-tour-reference-aligned.md](./2026-10-06-onboarding-tour-reference-aligned.md) — SPEC-03 · approved · Onboarding Tour aligned with the reference implementation: synchronous generation from a ready index (`full`/`partial`), grounded paths/commands, one Mermaid diagram, stale vs index commit, route `/repos/:repoId/tour`
