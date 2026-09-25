# The gate: signature, state, hook

How "is this change set already green?" is decided, and how `gh pr create` is
blocked when it is not.

## The signature

The staleness key. Computed in [`../scripts/signature.mjs`](../scripts/signature.mjs)
and imported by **both** the CLI and the hook, so they can never disagree.

```
sha256( HEAD_sha + "\n"
      + BASE_sha + "\n"
      + normalizeEOL(git diff --no-color --unified=3 BASE --) + "\n"
      + for each untracked path, sorted: path + "\0" + sha256(normalizeEOL(content)) )
```

The first 8 hex characters are what the report shows.

- **CRLF → LF normalization is mandatory.** Without it `core.autocrlf` flips the
  signature between a Git-Bash and a PowerShell invocation on the same tree, and
  the gate would re-close itself for no reason.
- Untracked files are hashed by content, not merely listed, so editing one
  invalidates the seal.
- The base is part of the hash: a `git fetch` that moves `origin/main` re-closes
  the gate, which is correct — the review no longer reflects what will merge.

## State — `.claude/.pr-self-review/` (gitignored)

| File | What |
|---|---|
| `state.json` | The seal. The only file the hook reads |
| `run.json` | Phase artifacts: change set, routing, file hashes, timings — the cache input |
| `last-report.md` / `.json` | The rendered and structured report |
| `pr-body.md` | The drafted PR body, written on a green seal |
| `phase3-cache.json` | Phase-3 findings keyed by (configHash, bundle, sliceHash) — accumulating, not last-run |

```json
{ "version": 1, "signature": "…", "headSha": "…", "base": "…", "branch": "…",
  "verdict": "approve", "score": 100, "criticals": 0, "warnings": 2,
  "incomplete": false, "forced": false, "sealedAt": "2026-09-21T14:02:11.004Z" }
```

**Never sealed** when: any CRITICAL stands, the run is `incomplete` (a bundle
would not parse, or `--only=` was used), or Phase 3 has not run yet.

## The hook

`.claude/hooks/pr-gate.mjs`, registered as a `PreToolUse` hook on `Bash` in
`.claude/settings.json`. The matcher narrows to the tool; the command
discrimination is in the script.

1. `tool_name !== 'Bash'` → allow.
2. **String prefilter** `command.includes('gh')` → allow. This runs on *every*
   Bash call, so nothing may spawn git before a match is confirmed. Measured
   ~137 ms on the non-matching path, essentially all of it Node startup.
3. Split on `&&`, `||`, `;`, `|`, newline. Tokenize each segment respecting
   quotes. Match only when, after stripping leading `VAR=value` assignments,
   `tokens[0] === 'gh'` and the first two non-flag arguments are `pr` then
   `create`.
4. `PR_SELF_REVIEW_BYPASS=1` among the stripped assignments → allow, with an
   advisory `systemMessage` so the bypass is visible in the transcript.
5. Compare `state.json` against a freshly computed signature. Allow only when all
   of: `version === 1`, signature matches, `verdict !== 'request_changes'`,
   `incomplete !== true`, and `sealedAt` is less than 4h old.
6. Otherwise `permissionDecision: "deny"` with a reason naming the specific
   cause — never run, signature moved, incomplete, request_changes, or expired.

**Verified to allow:** `gh pr view|list|checkout|diff|status|edit|comment|merge|
ready|close`, any non-`gh` command, any non-Bash tool, and
`git commit -m "gh pr create"` (the phrase inside a quoted argument is never
tokenized as a command).
**Verified to deny:** `gh pr create --fill` and `git push -u origin HEAD && gh pr create --fill`.

A gate that cannot verify does not open: if the signature cannot be computed at
all, the hook denies with the error in the reason.

## Overrides

1. **Per-invocation** — `PR_SELF_REVIEW_BYPASS=1 gh pr create …`. Read from the
   command text, not `process.env`, so it must be typed each time and stays
   auditable. The agent must never reach for this on the user's behalf.
2. **Deliberate seal** — `pr-self-review.mjs seal --force --reason "…"`. A reason
   is mandatory; it is written into `state.json` and appended to the report.
3. **Team-wide** — remove the `PreToolUse` block from `.claude/settings.json`.
   That is a reviewable commit, which is the point.

## Known limits

The hook only sees Bash commands in this session. A PR opened **in the browser**,
through a **GitHub MCP `create_pull_request` tool**, or via `hub` / a shell alias
bypasses it entirely. A follow-up can add the MCP tool name to the matcher.

`.claude/settings.json` ships to every teammate, including macOS and Linux, so
both scripts are pure Node ESM with zero shell dependence.
