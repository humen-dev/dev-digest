# client — `@devdigest/web` (map, not docs)

Context injected every session. Keep it a **map**: stack, commands, where things
live, non-default conventions, gotchas. Everything deep is a **link** below —
Claude reads those files only when a task touches them. Keep ≤100 lines.

## Stack
Next.js 15 (App Router) · React 19 · TanStack Query 5 · next-intl 3 ·
Tailwind v4 · TypeScript 5.7 · vitest 2 + jsdom. Package manager: **pnpm**.

## Commands
- `pnpm dev` — web on `:3000`
- `pnpm test` — vitest + jsdom, `fetch` mocked (no API / browser needed)
- `pnpm typecheck` — `tsc --noEmit`

## Where things live
- `src/app/**/page.tsx` — routes (App Router). Pages are **thin**.
- `src/lib/api.ts` + `src/lib/hooks/*` — every data hook talks to the API here.
- `src/components/app-shell` — nav, breadcrumbs, `g`-then-key shortcuts.
- `_components/<Name>/` — colocated feature logic + its `*.test.tsx`.
- `messages/<locale>/*.json` — i18n strings (next-intl).
- `src/vendor/ui` (`@devdigest/ui`) · `src/vendor/shared` (`@devdigest/shared`).

## Conventions (non-default)
- Pages thin; feature logic lives in colocated `_components/<Name>/`.
- All server data goes through a hook in `src/lib/hooks/*` → `src/lib/api.ts`.
- API base from `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`).

## Gotchas / do-not-touch
- Tests mock `fetch` — do **not** start the API to run them.
- `src/vendor/*` are **vendored copies** — edit at the source package, not here.

## Deeper context — read the file when the task touches it (don't preload)
- [`README.md`](./README.md) — overview + UI route-map diagram
- [`docs/`](./docs/) — deep dives, e.g. [`ui-architecture.md`](./docs/ui-architecture.md)
- [`specs/`](./specs/) — behavior specs, e.g. [`pages.md`](./specs/pages.md) · [`severity-findings-filter.md`](./specs/severity-findings-filter.md)
- [`INSIGHTS.md`](./INSIGHTS.md) — accumulated gotchas & non-obvious learnings
- [`../TESTING.md`](../TESTING.md) — cross-package test strategy
