# client — UI architecture (`@devdigest/web`)

How the Next.js studio is structured. Read alongside the map in
[`../AGENTS.md`](../AGENTS.md); this is the on-demand deep dive.

## App Router & component boundaries
- Routes are `src/app/**/page.tsx` (App Router). **Pages are thin** — they wire
  data hooks and lay out feature components, nothing more.
- Feature logic lives in colocated `_components/<Name>/` folders: `Name.tsx`,
  `styles.ts`, `index.ts` barrel, and `Name.test.tsx`.
- Most interactive surfaces are **Client Components** (`"use client"`) because they
  use TanStack Query + local state. Server Components are the default only for
  static shell/layout. Anything reading a hook or `window` is a client component.

## Data flow (one path)
- **All** server data goes through a hook in `src/lib/hooks/*`, which calls
  `src/lib/api.ts` (`api.get/post/...`). Components never `fetch` directly.
- API base comes from `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`).
- TanStack Query owns caching, polling (e.g. active runs poll every 4s), and
  invalidation. Mutations (`useFindingAction`, `useRunReview`, …) invalidate the
  relevant queries so the UI reflects persisted state.
- Contracts come from vendored `@devdigest/shared` (`src/vendor/shared`); UI
  primitives from `@devdigest/ui` (`src/vendor/ui`). Both are vendored copies —
  edit at the source package, not here.

## Cross-cutting patterns
- **i18n:** all user strings via next-intl, `messages/<locale>/<namespace>.json`,
  read with `useTranslations("<namespace>")`.
- **Severity taxonomy:** `CRITICAL | WARNING | SUGGESTION`; colour/icon come from
  `@devdigest/ui` `SEV` tokens + `SeverityBadge`. Counts are grouped client-side
  from already-loaded findings — never an extra call. See
  [`../specs/severity-findings-filter.md`](../specs/severity-findings-filter.md).
- **Hover popovers** must render through a **portal** (`createPortal` to
  `document.body`) when they live inside an `overflow:hidden` container (e.g. the
  PR-list table card) — an absolutely-positioned child would be clipped. Shared
  `FindingsHoverCard` + `FindingsPreviewList` implement this for both the list and
  the timeline.
- **Cost formatting:** `src/lib/format-cost.ts` — 2 significant figures below
  \$0.01 so tiny real costs stay legible.

## Testing
Vitest + jsdom with `fetch` mocked (`pnpm test`) — no API or browser needed. Render
tests wrap components in `NextIntlClientProvider`. See
[`../specs/pages.md`](../specs/pages.md) for the route/data map.
