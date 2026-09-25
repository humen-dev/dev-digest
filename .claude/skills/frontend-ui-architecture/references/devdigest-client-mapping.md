# DevDigest `client/` — mapping, known drift, settled decisions

Ties the rules to real paths. Observations were made at **skill v1.2.0** (2026-09-20)
and can go stale — check the file before acting on a line reference.

## Rules → real paths

| Rule | Where it shows up |
|---|---|
| Component folder with fixed files | `client/src/app/agents/_components/AgentCard/` (`AgentCard.tsx`, `constants.ts`, `helpers.ts`, `styles.ts`, `index.ts`, test) |
| Thin page | `client/src/app/agents/page.tsx` renders `<AgentsListView />` only |
| Nested `_components` | `.../pulls/[number]/_components/RunTraceDrawer/_components/TraceSection/` |
| Route-level shared pure code | `client/src/app/repos/[repoId]/pulls/helpers.ts` |
| Shared UI, promoted from routes | `client/src/components/{app-shell,diff-viewer,page-shell,repo-not-found}` |
| Component-group hooks | `client/src/components/app-shell/hooks/*` |
| Server-state hooks by domain | `client/src/lib/hooks/{core,agents,reviews,trace,repo-intel}.ts` over `client/src/lib/api.ts` |
| Purpose-named shared modules | `client/src/lib/{format-cost,github-urls,model-label}.ts` |
| Cross-cutting providers | `client/src/lib/{providers,theme,toast,repo-context}.tsx` |
| `@/` alias | `client/tsconfig.json` → `"@/*": ["./src/*"]` |

## Known drift — do not copy

| Where | Drift | Target |
|---|---|---|
| `client/src/app/repos/[repoId]/pulls/page.tsx` (`"use client"` on line 3) | Not thin: filter/sort pipeline (lines ~49–58), counts (60–61), and a mid-file constant `OPEN_STATUSES` (line 25) live in the page | Move the pipeline to pure functions in the route's `helpers.ts`, the constant to `constants.ts`, UI state to a view hook, and render from a `PullsListView` in `_components/` (see the worked example in [business-logic-layers.md](business-logic-layers.md)) |
| `.../agents/_components/AgentCard/AgentCard.tsx` line 9 | Deep relative import `../../../../lib/hooks/agents` | `@/lib/hooks/agents` |
| same file, lines ~44–48 | Hard-coded English strings ("Delete agent…") despite the i18n rule | `messages/<locale>/agents.json` + `useTranslations` |
| same file, lines ~49–57 | Static inline `style={{…}}` on the delete button | `styles.ts` |
| `client/src/lib/hooks/index.ts` | Barrel over all domain hooks | Tolerated; new code imports `@/lib/hooks/<domain>` |

Also note: the `react-best-practices` skill says to use "the project's
`useApiQuery`/`useApiMutation` core hooks", but no such hooks exist under
`client/src/lib/hooks` — domain hooks call `useQuery`/`useMutation` with `api.*`
directly. Follow the code; that mismatch in the other skill is not this skill's to fix.

## Settled decisions (owner, 2026-09-20)

Treat these as the rule for this repo, not as drift.

1. **`AppShell` stays per page.** Each route view renders `<AppShell crumb=…>` itself, so
   the page owns its breadcrumbs (a grep for `<AppShell` hits `app/page.tsx`,
   `pulls/page.tsx`, `pulls/[number]/page.tsx`, `agents/[id]/page.tsx`, `AgentsListView`,
   `SettingsView`). New route views follow the same pattern. This is a **deliberate
   exception** to the general Next.js advice to host persistent chrome in a layout; the
   accepted trade-off is that the shell remounts on navigation and loading UI renders
   without it.
2. **No `features/` layer.** Route folders (`app/<route>/_components`) plus
   `src/components` and `src/lib` are enough. Revisit only if several routes start sharing
   a domain (Bulletproof / Feature-Sliced Design describe that layer).

## Open items (need the team, not a rule yet)

1. **App-wide constants.** No shared constants module exists. Create a purpose-named one
   in `src/lib/` when the first cross-feature constant appears; do not pre-create it.
2. **`'use client'` on `page.tsx`.** Some pages carry it because they read hooks
   directly. The target is a server `page.tsx` rendering a client view, as `agents/page.tsx`
   does; changing existing pages is a refactor, not a drive-by.
3. **Versions.** Next docs cited were 16.3.5; the client is on 15. Recheck version-tied
   advice (`proxy.ts`, Cache Components) before recommending it.
