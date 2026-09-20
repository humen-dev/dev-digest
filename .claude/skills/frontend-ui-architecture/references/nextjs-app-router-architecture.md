# Next.js App Router — architecture

Architecture and organization only. API details (async `params`, metadata, route
handlers, serialization errors) live in `next-best-practices`; performance tuning is
out of scope.

**Version caveat.** The Next.js pages below were read in the **16.3.5** documentation;
`client/` runs **Next 15**. Use the version-independent principles here; treat anything
tied to 16 (`proxy.ts` replacing `middleware.ts`, Cache Components, `use cache`) as
"check before using".

## Contents
- Routes vs code
- Layouts
- The server/client boundary
- Providers
- Data: what this app does, and what changes if that changes
- Sources

## Routes vs code

- A folder is a route segment, but a route is **not public until a `page` or `route`
  file exists**, so project files can be colocated safely inside `app/` (Next.js docs).
- Colocation is safe by default; **`_folder`** (private folder) still earns its place: it
  separates UI code from routing, groups files consistently, and avoids clashes with
  future Next file conventions. DevDigest uses `_components/` for this.
- **Route groups** `(name)` organize routes and layouts without changing the URL —
  by section, intent or team, or to give a subset of routes their own layout.
- Next.js is unopinionated about layout of the rest; its own advice is to choose one
  strategy and be consistent. See [folder-structure.md](folder-structure.md).
- `page.tsx` is a **route entry**: read params/search params, place one view. Feature
  logic goes into the colocated `_components/<Name>/` folder.

## Layouts

A layout is UI **shared** between pages; on navigation layouts preserve state, stay
interactive and do not re-render. So persistent chrome (nav, sidebar, shell) belongs in a
layout, not in each page — otherwise it remounts on every navigation. The root layout is
required and holds `<html>`/`<body>`.

Nested layouts follow the folder hierarchy; use a route group when only some routes
should share a layout. Loading UI also nests inside the layout, so the shell stays visible
while a page streams in. (Deliberate exception in this repo: each route view renders
`AppShell` itself so the page owns its breadcrumbs — see
[devdigest-client-mapping.md](devdigest-client-mapping.md).)

## The server/client boundary

The boundary is a **module-graph** boundary:

- **Code crosses via imports**: everything a `'use client'` file imports joins the client
  bundle.
- **Data crosses via props**, and props must be serializable. Rendered React elements
  are serializable, so a Server Component can be passed **as `children`** to a Client
  Component without importing it into the client graph.

Placement rules:

1. `page.tsx` / `layout.tsx` stay Server Components by default and thin.
2. Put `'use client'` on the **entry** of each interactive subtree — a file that needs
   state, event handlers, browser APIs or custom hooks. You do not need it on every file
   below; modules imported from that entry are already client.
3. Keep the boundary as low in the tree as practical (a layout with a static logo and an
   interactive search: only the search is a Client Component).
4. Wrap a shared or third-party module in a small Client Component instead of editing the
   shared file to add the directive.
5. Compound components with static members (`Menu.Item`) break across the boundary —
   export the parts as named exports when a Server Component must use them.
6. `server-only` / `client-only` mark modules that must not cross.

**In this repo** most interactive views are Client Components (TanStack Query + local
state), so `'use client'` typically sits on the view/component file or the hook file
(`src/lib/hooks/*`, providers). That is consistent with rule 2 as long as `page.tsx` and
`layout.tsx` are not the ones carrying it without need — see the mapping file.

## Providers

React context is not available in Server Components. Create a Client Component that
accepts `children` and mount it **as deep as possible** (wrapping `{children}`, not the
whole `<html>`) so static parts stay server-rendered. `src/lib/providers.tsx` (React
Query + Theme + Repo + Toast) is mounted in the root layout, inside
`NextIntlClientProvider`.

## Data: what this app does, and what changes if that changes

DevDigest reads and writes through a **separate Fastify API** using TanStack Query in
Client Components — effectively an SPA-style client on Next. Next's own guide treats
this as a supported approach ("Next.js can start as … a strict SPA, and progressively add
server features"), with a client library (SWR/TanStack Query) for polling and mutations.

So the server-data guidance in the Next docs is **reference, not the current design**:

- **Data Access Layer (DAL), Server Actions, Route Handlers/BFF** do not apply today.
- If server-side data access is introduced, follow Next's rule: **pick one approach —
  external HTTP API, DAL, or component-level access — and do not mix them.** With a DAL:
  server-only module, authorization inside, returns minimal DTOs, only the DAL reads
  `process.env`, and `"use server"` files stay thin and delegate to it.
- Do not fetch from your own Route Handlers inside Server Components — fetch from the
  source.
- Server Actions cannot be *defined* in a Client Component; they are imported from a
  `'use server'` file. They are public POST endpoints: re-check auth inside each one.

## Sources

Next.js (docs v16.3.5) —
[Project structure](https://nextjs.org/docs/app/getting-started/project-structure) ·
[Layouts and Pages](https://nextjs.org/docs/app/getting-started/layouts-and-pages) ·
[Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) ·
[The Server and Client Boundary](https://nextjs.org/docs/app/guides/server-and-client-boundary) ·
[Data security (DAL)](https://nextjs.org/docs/app/guides/data-security) ·
[Fetching Data](https://nextjs.org/docs/app/getting-started/fetching-data) ·
[Mutating Data](https://nextjs.org/docs/app/getting-started/mutating-data) ·
[Single-Page Applications](https://nextjs.org/docs/app/guides/single-page-applications) ·
[Backend for Frontend](https://nextjs.org/docs/app/guides/backend-for-frontend).
Full list: [README.md](../README.md#sources).
