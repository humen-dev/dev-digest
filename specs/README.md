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
- _(add specs here: `[YYYY-MM-DD-slug.md](./YYYY-MM-DD-slug.md) — SPEC-NN · status · one line)_
