# Phase 1 — repo invariants (DET-001…018)

Implemented in [`../scripts/rules.mjs`](../scripts/rules.mjs). No LLM is involved,
so a CRITICAL here is never speculative: each rule is a fact about the change set.

All regex scanning runs on **added lines only**, after CRLF → LF normalization.
Two exclusions apply to every added-line rule, both about not flagging text that
merely *describes* a pattern:

- `.claude/skills/pr-self-review/**` and `.claude/.pr-self-review/**` — this skill
  is the rulebook and necessarily contains every regex it hunts for.
- For command-shaped rules, `*.md` / `*.mdx` / `*.txt` — prose documents a
  forbidden command precisely in order to forbid it. `AGENTS.md` warning "never
  `docker compose down -v`" must not trip DET-007.

## Primitives

```bash
BASE=$(git merge-base origin/main HEAD 2>/dev/null || git merge-base main HEAD)
git diff --no-color --name-status "$BASE" --     # branch + staged + unstaged
git ls-files --others --exclude-standard         # untracked
```

Two-dot `git diff <merge-base> --` already yields branch commits + staged +
unstaged in one patch. Untracked files are synthesized as one whole-file hunk in
JS — `git diff --no-index /dev/null` has no Windows equivalent.

A deleted file appears in `--name-status` but has no post-image, so it is in the
path list without an entry in the parsed patch.

## The rules

| ID | Severity | Detects | Why it matters |
|---|---|---|---|
| **DET-001** | CRITICAL | A lockfile changed while its sibling `package.json` did not | Each package pins its own lockfile; a hand-edit desyncs it from the manifest and breaks `--frozen-lockfile` in CI |
| **DET-002** | CRITICAL | `M` or `D` status on `server/src/db/migrations/NNNN_*.sql` (`A` is fine) | Migrations are append-only history; editing an applied one leaves every existing database in a state the files no longer describe |
| **DET-003** | CRITICAL | A path under `**/src/vendor/shared/**` changed | `@devdigest/shared` is vendored per package — editing a copy makes packages disagree until the next re-vendor silently reverts it. `client/src/vendor/ui/**` is a different thing and is NOT matched |
| **DET-004** | CRITICAL | A `CLAUDE.md` whose content, after stripping HTML comments, is not exactly `@AGENTS.md` | The stubs are one-line imports; content here is invisible to anything reading `AGENTS.md` |
| **DET-005** | CRITICAL | `server/.dependency-cruiser-known-violations.json` grew | The baseline exists to freeze pre-existing drift so it can only shrink; growing it buries a new layering violation |
| **DET-006** | CRITICAL | A credential shape in an added line, or a new `.env*` file | Secrets live in `~/.devdigest/secrets.json` (mode 0600). `kind: 'secret_leak'` |
| **DET-007** | CRITICAL | `docker compose down -v` added in a non-prose file | `-v` wipes `devdigest_pgdata` — every imported repo and review |
| **DET-008** | CRITICAL | A conflict marker in an added line | The file is a half-merged state rather than source |
| **DET-009** | CRITICAL | A new `NNNN_*.sql` duplicating an existing number or skipping past `max+1` | Drizzle applies these in order; a gap or duplicate makes the applied order depend on the filesystem |
| **DET-010** | CRITICAL | `server/src/db/schema/**` changed with no new migration added | Migrations are not applied on boot, so code and every database diverge silently |
| **DET-011** | WARNING* | A `.claude/skills/*/` with no entry in `routes ∪ excluded`, or an entry pointing at a missing dir | An unrouted skill is never applied to any diff. *CRITICAL when the change set itself adds a `SKILL.md` — the author is demonstrably in the right context to fix it |
| **DET-012** | WARNING | `console.log(` / `debugger` added in `server/src/**` or `client/src/**`, excluding tests | The server logs through Pino; the client has no console contract |
| **DET-013** | WARNING | `skills-lock.json` changed with no `.claude/skills/**` change | The lock and the installed skills disagree |
| **DET-014** | WARNING | `e2e/specs/*.flow.json` changed | Flows need a live stack, so the gate typechecks them but never runs them — `./scripts/e2e.sh` is on the author |
| **DET-015** | WARNING | `origin/main` is ahead of the merge-base | The review does not see what the PR will merge against. **The gate never fetches** — a gate does no network |
| **DET-016** | WARNING | A changed `modules/*/service.ts`, `modules/*/repository.ts` or `_components/**/index.tsx` with no `*.test.ts(x)` in the same change set | Business logic shipped without a test |
| **DET-017** | WARNING | An added `t('…')` lookup in `client/src/**` with no `client/messages/**` change | The key renders as its own id |
| **DET-018** | WARNING | More than `gate.largeDiff.files` files or `gate.largeDiff.lines` changed lines | Phase-3 coverage degrades past this size because bundles get split and reduced |

## Adding a rule

1. Implement it in `runDeterministic` in `../scripts/rules.mjs`, returning through
   the `finding()` helper so the shape matches the repo's Zod `Finding`.
2. Give it the next free `DET-NNN`. The id is part of the acceptance key, so
   renumbering an existing rule invalidates every `accepted.json` entry for it.
3. Default to `WARNING`. Reserve `CRITICAL` for something that is *certainly*
   wrong — a blocking false positive is the failure mode that kills the gate.
4. Prove it: plant the violation on a scratch branch, run `run --only=det`, and
   confirm it fires **and** that a near-miss does not.
5. Document it in the table above and in `README.md`'s history.
