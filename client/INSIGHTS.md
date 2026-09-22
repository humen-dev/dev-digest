# client — INSIGHTS

Running log of **non-obvious** learnings the code doesn't reveal on its own:
gotchas hit while debugging, why a surprising decision was made, sharp edges to
avoid. Linked (not preloaded) from [`CLAUDE.md`](./CLAUDE.md) — read on demand.

> Not for: standard React/Next rules, lint-caught issues, or file-by-file
> description (Claude reads the code). One insight per bullet; newest on top.
> Date each entry so stale ones are easy to prune.

## What Works
_(none yet)_

## What Doesn't Work
- 2026-09-20 — The `react-best-practices` skill says to use "the project's `useApiQuery`/`useApiMutation` core hooks" (`.claude/skills/react-best-practices/SKILL.md:111`), but no such hooks exist in the client — following it yields imports that don't resolve. ALWAYS follow the code: domain hooks in `src/lib/hooks/<domain>.ts` call `useQuery`/`useMutation` with `api.get/post/put` and own the queryKey + invalidation (`client/src/lib/hooks/agents.ts:8`, `client/src/lib/hooks/agents.ts:34`).
- 2026-09-18 — A fixed-decimal cost format (e.g. 4 dp under a cent) FLATTENS real cheap-model costs: a deepseek/OpenRouter review run costs ~$0.00004, which 4 dp renders as "$0.0000" (looks free) and collapses distinct tiny values ($0.000175 vs $0.000248) onto one string. Use 2 significant figures below $0.01 (`toPrecision(2)`), keep 3 dp at/above $0.01 (`client/src/lib/format-cost.ts:12`). Only surfaced against LIVE seeded costs in the browser — the design mock values ($0.0013+) hid it.

## Codebase Patterns
- 2026-09-22 — `client/src/vendor/ui/nav.ts` (WORKSPACE items + `SHORTCUTS`) was edited
  directly to add the `skills` nav entry, even though `src/vendor/*` is normally
  "vendored — edit at the source package, not here" (client/CLAUDE.md). There is no
  upstream `@devdigest/ui` package in this repo to edit instead — the vendored copy
  *is* the source — so this is a deliberate, documented exception, not drift. Next
  time a nav item needs adding, edit `nav.ts` in place; don't go looking for an
  upstream repo that doesn't exist.
- 2026-09-20 — NEVER "fix" the layout by hoisting `AppShell` into a layout or by adding a `features/` layer — both are deliberate owner decisions, not drift. Each route view renders `<AppShell crumb=…>` itself because the page owns its breadcrumbs and a layout can't see page data (`client/src/components/app-shell/AppShell.tsx:10` takes `crumb`; call sites e.g. `client/src/app/repos/[repoId]/pulls/page.tsx:66`). Accepted trade-off: the shell remounts on navigation (this contradicts the generic Next.js "persistent chrome in a layout" advice). New route views follow the same pattern; structure stays route `_components` + `src/components` + `src/lib`. Rationale and the rest of the placement rules: `.claude/skills/frontend-ui-architecture/references/devdigest-client-mapping.md`.
- 2026-09-19 — A hover popover anchored inside the PR-list table (`client/src/app/repos/[repoId]/pulls/styles.ts:91` `tableCard` has `overflow:hidden`) gets CLIPPED if positioned `absolute` within a row — worst on the last row. Render it in a **portal to `document.body`** with `position:fixed` computed from the trigger's `getBoundingClientRect()`, and clamp `maxHeight` to `innerHeight - top - 12` so it never overflows the viewport (no flip logic needed). See `client/src/app/repos/[repoId]/pulls/_components/FindingsHoverCard/FindingsHoverCard.tsx:73`. There is no Tooltip/Popover primitive in `@devdigest/ui` — only a click `Dropdown` (`vendor/ui/kit`), so hover popovers are hand-rolled; reuse `FindingsHoverCard` + `FindingsPreviewList` (shared by the list cell and the Agent-runs timeline).

## Tool & Library Notes
- 2026-09-22 — `SkillBodyEditor` (`client/src/app/skills/[id]/_components/SkillEditor/_components/ConfigTab/_components/SkillBodyEditor/SkillBodyEditor.tsx`)
  ships as a plain monospace `<textarea>` + a synced line-number gutter, with NO
  markdown syntax highlighting. The plan explicitly allowed falling back from a
  transparent-textarea-over-`<pre>` regex-highlight overlay if it proved fragile
  (scroll/wrap desync) rather than pulling in CodeMirror for one field — we took
  that fallback up front instead of building the overlay first, since jsdom
  doesn't lay out text (no real `scrollHeight`/wrapping), so the one thing that
  would actually validate overlay alignment (visual scroll sync) can't be unit
  tested anyway. If highlighting is wanted later, prototype it manually in the
  browser before trusting any test to catch desync.

## Recurring Errors & Fixes
_(none yet)_

## Session Notes
_(none yet)_

## Open Questions
- 2026-09-18 — The three cost UI surfaces (`PRRow` COST column, `RunHistory` `tok · cost` line, `TraceBody` Cost tile) have NO component render tests — cost is covered only by the `formatCost` unit test (`client/src/lib/format-cost.test.ts:1`) + a manual browser check. Add render assertions (value + "—" on null) when next touching them.
