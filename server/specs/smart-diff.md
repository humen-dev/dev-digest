# Smart Diff — spec (server)

Groups a PR's changed files by **role** so the reviewer reads business logic first
and lock files last, and says which lines carry current review findings. Read-only
and deterministic: no model call, no persistence. Client side:
[`../../client/specs/pages.md`](../../client/specs/pages.md) (Files changed).
Explanation: [`../docs/smart-diff.md`](../docs/smart-diff.md).

```
pr_files ──► classifyFile(path) ──► groups in role order ──┐
reviews (latest per agent, kind=review) ──► findings (not dismissed) ──► finding_lines ──┴──► SmartDiffResponse
```

## Decisions (locked)

| # | Decision | Consequence |
|---|---|---|
| D1 | Own module `modules/smart-diff/` | Route stays thin; Drizzle only in `repository.ts` |
| D2 | `classifyFile(path)` is a pure ring-1 function | `smart-diff/index.ts` re-exports only pure symbols, so **L08 imports the classifier as a pre-prompt filter** without Fastify or a DB |
| D3 | Rules are ordered globs, **first match wins**: boilerplate → tests → wiring → docs; no match ⇒ `core` | The order is a product decision, pinned by `server/test/smart-diff-classify.test.ts` |
| D4 | Directory globs match at **any depth** (`**/test/**`, `**/.claude/**`, …) | A monorepo's `server/test/x.ts` is `tests`, not `core` |
| D5 | Only `index.ts` / `index.js` are barrels | `index.tsx` (a page/component) stays `core` |
| D6 | "Current findings" = latest `kind='review'` review **per agent** (agent-less reviews share one bucket; `created_at` tie → larger id), union across agents, **dismissed excluded** | Same rule as the PR-list counts and the client overlay; re-running an agent never doubles markers |

## Classification (`smart-diff/constants.ts` `SMART_DIFF_ROLE_GLOBS`)

| Role | Globs |
|---|---|
| boilerplate | `*.lock`, `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `dist/`·`build/`·`__snapshots__/` dirs, `*.snap`, `*.generated.*`, `*.min.js` |
| tests | `*.test.ts(x)`, `*.it.test.ts`, `*.spec.ts`, `test/`·`tests/`·`__tests__/`·`e2e/` dirs |
| wiring | `index.ts`, `index.js`, `*.config.*`, `tsconfig*.json`, `.eslintrc*`, `.env*`, `docker-compose*.yml`, `.github/`·`.claude/` dirs |
| docs | `*.md`, `docs/` dir, `README*`, `CHANGELOG*`, `LICENSE` |
| core | everything else |

Glob semantics (`domain/path-glob.ts`): path normalised (`\`→`/`, leading `./` and
`/` stripped); a glob without `/` matches the basename at any depth; `*` = run of
non-`/` chars; case-insensitive; compiled once at module load.

Edge cases the order decides (pinned in the test table):

| Path | Role | Why |
|---|---|---|
| `__tests__/__snapshots__/x.snap` | boilerplate | snapshot rule precedes tests |
| `.claude/skills/security/SKILL.md` | wiring | markdown here configures agent behaviour; `.claude/` precedes docs |
| `e2e/README.md` | tests | `e2e/` precedes docs — kept deliberately |
| `dist/index.js` | boilerplate | build output precedes the barrel rule |

## `GET /pulls/:id/smart-diff`

| Params | 200 | Errors (`ApiErrorBody`) |
|---|---|---|
| `IdParams` (`id` uuid) | `SmartDiffResponse` (`contracts/brief.ts` `SmartDiff`) | 422 non-uuid id · 404 `not_found` when the PR is not in the caller's workspace |

- `groups` follow `SmartDiffRole.options` (`core, tests, wiring, docs, boilerplate`); empty groups omitted; each file in exactly one group.
- `finding_lines` = sorted, de-duplicated `start_line` of current findings (D6) on that path; `[]` when none. `pseudocode_summary` omitted.
- `split_suggestion = { too_big: false, total_lines: Σ(additions + deletions), proposed_splits: [] }`.
- Never calls a model; global rate limit applies.

## Invariants
- `SmartDiffRole` is identical in both vendored `brief.ts` copies.
- Changing `SMART_DIFF_ROLE_GLOBS` or its order requires updating the test table in the same change.
