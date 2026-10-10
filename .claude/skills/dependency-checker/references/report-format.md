# Report format

`report.mjs` renders the fact sections. You fill the sections marked
`<!-- AGENT: … -->`, replacing the marker entirely. Write in English; keep the
section numbers and titles unchanged so reports diff cleanly between runs.

## §1 Summary

Exactly this shape:

```markdown
**Verdict: needs attention** — 1 P1 and 14 P2 findings; no vulnerabilities checked/found.

- **Biggest risk:** `@fastify/autoload` is declared in server prod deps but unused (F02).
- **Biggest size win:** clean reinstall of mcp + reviewer-core reclaims 147 MB of stray files (F09, F11).
- **Consistency:** `zod` is aligned (3.25.76) but pinned via tsconfig aliases in 2 packages (F22, F23).
- **Not checked:** e2e audit failed (network) — rerun with `--audit`.
```

Verdict scale: **healthy** (no P0/P1, ≤ 5 P2) · **needs attention** (any P1 or > 5 P2)
· **at risk** (any P0).

## §5 "Other" classification (only if the marker exists)

```markdown
- `fastify-sse-v2` → Framework / runtime — Fastify plugin for server-sent events. Pattern: `^fastify-sse-`
```

## §10 False positives

One line per rejected finding, or `None — all findings verified.` — the latter only after every
`possibly-unused` finding went through the decision order in the advice playbook (a
`possibly-unused` with `also installed transitively via …` is the most common false positive).

```markdown
- F12 — false positive: `react-dom` is a peer that `@tanstack/react-query` expects the app to declare; it is not imported directly, but removing it breaks rendering.
```

## §11 Prioritized action plan

```markdown
| # | P | Action | Findings | Impact | Effort | Command / change |
|---|---|---|---|---|---|---|
| 1 | P1 | Remove unused `@fastify/autoload` from server | F02 | med | S | `cd server && pnpm remove @fastify/autoload` |
| 2 | P2 | Clean reinstall mcp and reviewer-core with npm | F09, F11 | high (147 MB) | S | `cd mcp && rm -rf node_modules && npm ci` (same in reviewer-core) |
```

- Ordered by priority, then impact ÷ effort ([priority-rules.md](priority-rules.md)).
- One row per decision, not per finding; group same-command rows.
- Commands from [advice-playbook.md](advice-playbook.md), correct manager per package.
- End with a one-line **"After the plan"** estimate: prod footprint / reclaimed MB,
  computed from the `exclusive` sizes in §6 — never invented.

## §12 Recommendations

Four groups (Security · Size & performance · Consistency across packages · Hygiene
& process), 2–4 bullets each, each bullet citing a section, finding ID or number.
Omit a group only if there is nothing evidence-backed to say, and write
`Nothing beyond the action plan.` instead.

## Style

- Tables over prose; backticks around package names and commands.
- Sizes exactly as the report prints them (`27.4 MB`), never re-rounded.
- No marketing words ("blazing", "bloated"); state numbers.
