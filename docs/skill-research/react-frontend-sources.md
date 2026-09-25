# React frontend best practices — source registry

Research date: 2026-09-20. This is the working research log behind the
[`frontend-ui-architecture`](../../.claude/skills/frontend-ui-architecture/SKILL.md) skill
(v1.0.0). The skill's [README](../../.claude/skills/frontend-ui-architecture/README.md#sources)
holds the canonical, published source list; this file keeps the per-source notes ("what we
take") from the research phase. Section numbers are shared between the two.

**Status legend**
- ✅ **Opened and read** (WebFetch) — content verified, safe to quote.
- 🔎 **Search results only** — the page exists but was not opened; re-read before relying on it.
- ⚠️ **Could not be opened** / lower confidence.

**Levels:** **A** official documentation · **B** recognised authors / methodologies ·
**C** secondary / contextual material.

**Numbering note:** there is no §6 — the former performance section moved to §10 when the
scope was narrowed to architecture.

---

## 1. Project structure and where things live

| # | Source | Level | Status | What we take |
|---|---|---|---|---|
| 1.1 | [Next.js — Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure) | A | ✅ | Next.js is **unopinionated**; colocation is safe (a route is public only with `page`/`route`); `_folder` = private folder; three strategies (files outside `app`, inside `app`, split by feature/route); "pick one and be consistent". |
| 1.2 | [Bulletproof React — project-structure.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) | B | ✅ | `src/{app,components,config,features,hooks,lib,stores,types,utils}`; a feature folder = `api/components/hooks/stores/types/utils`; one-way flow `shared → features → app`; **no cross-feature imports**; ESLint `import/no-restricted-paths`; against barrel files. |
| 1.3 | [Bulletproof React — repository](https://github.com/alan2207/bulletproof-react) | B | 🔎 | General context and example apps. |
| 1.4 | [Robin Wieruch — React Folder Structure Best Practices (2026)](https://www.robinwieruch.de/react-folder-structure/) | B | ✅ | Staged evolution of structure; component folder = `component / index / test / style / types / hooks / constants`; **promotion rule: 1 feature → lives in the feature, 2+ → shared**; don't nest deeper than 2 levels; kebab-case files. |
| 1.5 | [Josh Comeau — Delightful React File/Directory Structure](https://www.joshwcomeau.com/react/file-structure/) | B | ✅ | Organise **by function**, not by feature; folder per component with `Comp.tsx`, `Comp.helpers.ts`, `Comp.types.ts`, `index.ts`; `hooks/`, `helpers/` (project-specific), `utils` (generic), `constants.ts`; defends barrel files. |
| 1.6 | [Feature-Sliced Design — Slices and segments](https://feature-sliced.design/docs/reference/slices-segments) | B | ✅ | Segments `ui / api / model / lib / config`: `model` = schemas, stores, **business logic**; `lib` = internal libraries; `config` = configs and feature flags. Name segments by **purpose**, not form (`components/hooks/types` are weak names). |
| 1.7 | [Feature-Sliced Design — Layers](https://feature-sliced.design/docs/reference/layers) | B | 🔎 | Layers `app → pages → widgets → features → entities → shared`; imports only downward. |
| 1.8 | [Feature-Sliced Design — Overview](https://feature-sliced.design/docs/get-started/overview) | B | 🔎 | Entry point to the methodology. |
| 1.9 | [FSD — GitHub docs](https://github.com/feature-sliced/documentation) | B | 🔎 | Primary documentation repository. |
| 1.10 | [Sandro Roth — How to structure your React projects](https://sandroroth.com/blog/project-structure/) | B | 🔎 | Alternative take on structure. |
| 1.11 | [Tania Rascia — React architecture & directory structure](https://www.taniarascia.com/react-architecture-directory-structure/) | B | 🔎 | Practical example of where utils/constants go. |
| 1.12 | [Jack Franklin — Structuring React applications](https://www.jackfranklin.co.uk/blog/structuring-react-applications/) | B | 🔎 | Classic material on structure. |
| 1.13 | [Web Dev Simplified — How To Structure React Projects](https://blog.webdevsimplified.com/2022-07/react-folder-structure/) | C | 🔎 | Overview of approaches, beginner to advanced. |
| 1.14 | [Profy — Popular React Folder Structures and Screaming Architecture](https://profy.dev/article/react-folder-structure) | C | 🔎 | Comparison of structures, screaming architecture. |
| 1.15 | [React (legacy) — File Structure FAQ](https://legacy.reactjs.org/docs/faq-structure.html) | A | 🔎 | Official (outdated) position: "there is no single right way", avoid deep nesting (3–4 levels). |

## 2. Colocation and avoiding hasty abstraction (where constants/utils live)

| # | Source | Level | Status | What we take |
|---|---|---|---|---|
| 2.1 | [Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation) | B | ✅ | "Place code as close to where it's relevant as possible"; tests, styles, state and **utilities** stay nearby; don't extract prematurely into a catch-all `utils/`; separation of concerns ≠ physical separation. |
| 2.2 | [Kent C. Dodds — State Colocation will make your React app faster](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster) | B | 🔎 | State closer to its consumer = simpler and faster. |
| 2.3 | [Kent C. Dodds — Application State Management with React](https://kentcdodds.com/blog/application-state-management-with-react) | B | 🔎 | Two kinds of state: server cache and UI state. |
| 2.4 | [Kent C. Dodds — AHA Programming](https://kentcdodds.com/blog/aha-programming) | B | 🔎 | Avoid Hasty Abstractions: duplication is cheaper than the wrong abstraction → don't move things into `utils` too early. |
| 2.5 | [Kent C. Dodds — AHA Programming (talk)](https://kentcdodds.com/talks/aha-programming) | B | 🔎 | Talk on the same topic. |
| 2.6 | [Next.js — Project Organization and File Colocation (v14 docs)](https://nextjs.org/docs/14/app/building-your-application/routing/colocation) | A | 🔎 | Earlier version of the same page, for comparison. |

> Terminology: Comeau distinguishes a **helper** (project-specific) from a **utility**
> (generic function) — see 1.5. FSD puts constants in `config` and utilities in `lib` — see 1.6.

## 3. Component decomposition

| # | Source | Level | Status | What we take |
|---|---|---|---|---|
| 3.1 | [react.dev — Thinking in React](https://react.dev/learn/thinking-in-react) | A | 🔎 | Step 1: break the UI into a hierarchy; **single responsibility** — a component does one thing, when it grows it is decomposed; the component hierarchy mirrors the data model. |
| 3.2 | [react.dev — Thinking in React (raw .md)](https://react.dev/learn/thinking-in-react.md) | A | 🔎 | Same text as markdown — easier to parse. |
| 3.3 | [react.dev — Components and Hooks must be pure](https://react.dev/reference/rules/components-and-hooks-must-be-pure) | A | 🔎 | Render purity: side effects belong in event handlers or Effects. |
| 3.4 | [react.dev — Rules of React](https://react.dev/reference/rules) | A | 🔎 | Summary of the rules. |
| 3.5 | [Vercel — composition-patterns (agent skill)](https://github.com/vercel-labs/agent-skills/tree/main/skills/composition-patterns) | B | ✅ | Rules: no boolean props, compound components, lift state into a provider, `children` over render props, explicit variants instead of one configurable component. |
| 3.6 | [Vercel — react-best-practices AGENTS.md](https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/AGENTS.md) | B | 🔎 | 40+ performance rules in 8 categories; **a ready-made "agent rules" format** — a useful model for our skill. |
| 3.7 | [Vercel — Introducing: React Best Practices](https://vercel.com/blog/introducing-react-best-practices) | B | 🔎 | Rationale for the rule set. |
| 3.8 | [Vercel agent-skills — repository](https://github.com/vercel-labs/agent-skills) | B | 🔎 | Skill structure (rules → compiled AGENTS.md). |
| 3.9 | [React TypeScript Cheatsheet](https://react-typescript-cheatsheet.netlify.app/) | B | 🔎 | Typing props, `children: ReactNode`, `FC` vs plain functions. |
| 3.10 | [React TS Cheatsheet — patterns by use case](https://github.com/typescript-cheatsheets/react/blob/main/docs/advanced/patterns_by_usecase.md) | B | 🔎 | Typing patterns for complex components. |

## 4. Where business logic lives (hooks / container / model / API layer)

| # | Source | Level | Status | What we take |
|---|---|---|---|---|
| 4.1 | [react.dev — Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks) | A | ✅ | A hook name is `use` + capital letter; **a function with no hooks does not get the `use` prefix**; wrap every Effect in a hook; **avoid lifecycle hooks** like `useMount`; hooks target concrete high-level use cases. |
| 4.2 | [react.dev — You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) | A | 🔎 | Don't use Effects to transform data for rendering or to react to events; an Effect is only for syncing with an external system. |
| 4.3 | [react.dev — Extracting State Logic into a Reducer](https://react.dev/learn/extracting-state-logic-into-a-reducer) | A | ✅ | When to use `useReducer`: many handlers changing state; a reducer is a pure function, testable in isolation; **one action = one user interaction**; no side effects in a reducer. |
| 4.4 | [react.dev — Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure) | A | 🔎 | Don't store derived values (compute during render); no duplication (store an id, not the object). |
| 4.5 | [react.dev — Sharing State Between Components](https://react.dev/learn/sharing-state-between-components) | A | 🔎 | Lift state to the common parent; a single source of truth for each piece of state. |
| 4.6 | [react.dev — Managing State](https://react.dev/learn/managing-state) | A | 🔎 | Overview of the state section. |
| 4.7 | [Patterns.dev — Container/Presentational Pattern](https://www.patterns.dev/react/presentational-container-pattern/) | B | ✅ | The pattern, plus the note that **hooks replaced container components**; downside: needless complexity in small apps. |
| 4.8 | [Dan Abramov — Presentational and Container Components](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0) | B | ⚠️ | Original source of the pattern. **Returned 403** — content (including his later note about hooks) not verified; the skill does not rely on it. Mirror: [readmedium](https://readmedium.com/smart-and-dumb-components-7ca2f9a7c7d0). |
| 4.9 | [TkDodo — The Query Options API](https://tkdodo.eu/blog/the-query-options-api) | B | ✅ | `queryOptions` = `queryKey` + `queryFn` together (separating them was a mistake); **don't write a hook that just wraps `useQuery` and adds nothing**; type safety via `queryOptions`. |
| 4.10 | [TkDodo — Practical React Query](https://tkdodo.eu/blog/practical-react-query) | B | 🔎 | Practices for organising queries in an app. |
| 4.11 | [TanStack Query — Discussion #8547: layered architecture](https://github.com/TanStack/query/discussions/8547) | B | 🔎 | Discussion: `queryOptions` in the API segment, `useQuery` in the UI layer. |
| 4.12 | [Felix Gerschau — Separation of concerns with React hooks](https://felixgerschau.com/react-hooks-separation-of-concerns/) | C | 🔎 | Separating logic from presentation with hooks. |
| 4.13 | [TSH — Container-presentational pattern in React](https://tsh.io/blog/container-presentational-pattern-react) | C | 🔎 | Practical walkthrough. |
| 4.14 | [Martin Buchalik — The Controller Pattern](https://medium.com/@MBuchalik/the-controller-pattern-separate-business-logic-from-presentation-in-react-331f72fcb32a) | C | 🔎 | Alternative "controller" pattern. |
| 4.15 | [Frontend Patterns — Presentational vs Container](https://frontendpatterns.dev/presentational-vs-container/) | C | 🔎 | Overview. |

## 5. Next.js App Router — architecture (our stack: Next 15 + React 19)

The focus is **architecture**, not performance (performance material moved to §10).

> **Version.** The pages below were read in the **Next.js 16.3.5** documentation, while
> `client/` runs **Next 15**. Use version-independent architectural principles;
> `proxy.ts` (16; in 15 it is `middleware.ts`), Cache Components and `use cache` only with a
> version note.

### 5A. Structure and routes

| # | Source | Level | Status | What we take |
|---|---|---|---|---|
| 5.1 | [Next.js — Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure) | A | ✅ | (Same as 1.1) Next is unopinionated; colocation is safe; `_private` folders; route groups `(x)`; three file-placement strategies. |
| 5.2 | [Next.js — Layouts and Pages](https://nextjs.org/docs/app/getting-started/layouts-and-pages) | A | ✅ | A layout preserves state and **does not re-render between navigations**; nested layouts; root layout is required; `searchParams` (server, opts into dynamic rendering) vs `useSearchParams` (client, when params are only needed on the client). |

### 5B. Server / client boundary

| # | Source | Level | Status | What we take |
|---|---|---|---|---|
| 5.3 | [Next.js — Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) | A | ✅ | What each kind can do; pass a Server Component as `children` into a Client one (a "slot"); **context providers as a Client wrapper taking `children`, as deep as possible**; `server-only`/`client-only` against environment poisoning; wrap third-party client components in your own Client Component. |
| 5.4 | [Next.js — The Server and Client Boundary](https://nextjs.org/docs/app/guides/server-and-client-boundary) | A | ✅ | The boundary is the **module graph**: **code crosses via imports, data via serializable props**; `'use client'` is needed only at the entry of a client subtree; wrap a shared module in a Client Component rather than editing it; compound components with static members (`Menu.Item`) break across the boundary → export named parts; **owner vs parent**. |

### 5C. Data and mutations (data access layer)

| # | Source | Level | Status | What we take |
|---|---|---|---|---|
| 5.5 | [Next.js — Data security (Data Access Layer)](https://nextjs.org/docs/app/guides/data-security) | A | ✅ | **Three approaches: external HTTP APIs / DAL / component-level access — pick one, don't mix.** DAL: server only, authorization, returns minimal DTOs; only the DAL reads `process.env`; `"use server"` files stay thin and delegate to the DAL; Server Actions are public POST endpoints. |
| 5.6 | [Next.js — Fetching Data](https://nextjs.org/docs/app/getting-started/fetching-data) | A | ✅ | Fetch where the data is needed (requests are deduplicated); `React.cache` for non-`fetch`; preload next to the consumer; in Client Components use `use()` or SWR / TanStack Query. *(streaming/caching parts are out of focus)* |
| 5.7 | [Next.js — Mutating Data](https://nextjs.org/docs/app/getting-started/mutating-data) | A | ✅ | `'use server'` on a file or inline; in Client Components Actions are **imported, not defined**, from a `'use server'` file; check auth inside every Action. |
| 5.8 | [Next.js — Backend for Frontend](https://nextjs.org/docs/app/guides/backend-for-frontend) | A | ✅ | Route Handlers = public endpoints / proxy to a backend; **don't call Route Handlers from Server Components** (fetch from the source); Server Actions are not for reading data (they run sequentially). |

### 5D. SPA style on Next (closest to our `client/`)

| # | Source | Level | Status | What we take |
|---|---|---|---|---|
| 5.9 | [Next.js — Single-Page Applications](https://nextjs.org/docs/app/guides/single-page-applications) | A | ✅ | Next can be a "strict SPA" and **add server features progressively**; the `use()` + Context Provider pattern; SWR or TanStack Query for polling/mutations; `next/dynamic` with `ssr: false` for browser-only code. |
| 5.10 | [Next.js — Client-side data fetching](https://nextjs.org/docs/app/guides/client-side-data-fetching) | A | 🔎 | Client fetching with a library, initial data from a Server Component, cache coordination. *(linked from 5.6 and 5.9)* |
| 5.11 | [vercel-labs/next-spa-patterns (demo)](https://github.com/vercel-labs/next-spa-patterns) | B | 🔎 | Working SPA-pattern examples on Next. *(linked from 5.9)* |

### 5E. Reference only (linked from the pages above, not opened)

| # | Source | Level | Status | Why |
|---|---|---|---|---|
| 5.12 | [Next.js — Server Actions and Mutations](https://nextjs.org/docs/app/guides/server-actions) | A | 🔎 | Details of the Server Actions model. |
| 5.13 | [Next.js — Authentication](https://nextjs.org/docs/app/guides/authentication) | A | 🔎 | Where authentication lives in the architecture. |
| 5.14 | [Next.js — Rendering Philosophy](https://nextjs.org/docs/app/guides/rendering-philosophy) | A | 🔎 | Static/dynamic rendering as a per-component spectrum. |
| 5.15 | [Next.js — Building interactive apps](https://nextjs.org/docs/app/guides/interactive-apps) | A | 🔎 | Transitions, optimistic UI, pending states. |
| 5.16 | [Next.js — Composition Patterns (v14 docs)](https://nextjs.org/docs/14/app/building-your-application/rendering/composition-patterns) | A | 🔎 | Earlier version of composition guidance — for comparison with Next 15. |
| 5.17 | [Next.js Learn — Server and Client Components](https://nextjs.org/learn/react-foundations/server-and-client-components) | A | 🔎 | Learning material. |
| 5.18 | local skill `next-best-practices` | — | — | Already installed in the environment — its overlap was checked when the skill was written. |

### 5F. How this maps to our `client/` (observations)

- **The convention already exists:** `src/app/**/_components/<Name>/` with `Name.tsx`,
  `constants.ts`, `helpers.ts`, `styles.ts`, `index.ts`, `Name.test.tsx`; nested
  `_components/`; a route-level `helpers.ts` (`repos/[repoId]/pulls/helpers.ts`). This nearly
  matches Comeau (1.5) plus Next private folders (5.1).
- **Thin pages:** `src/app/agents/page.tsx` only renders `<AgentsListView />`.
- **63 files with `'use client'`** (all of `lib/hooks/*`, providers, `AppShell`, views) →
  effectively an **SPA style on Next + TanStack Query over a separate Fastify API**. So
  5.5/5.7/5.8 (DAL, Server Actions, BFF) are **reference only** for us; the relevant ones are
  5.1–5.4, 5.9, 5.10.

## 7. Barrel files (`index.ts`) — a contested topic

Our `client/` already uses `_components/<Name>/index.ts`, so the question is practical.
Opinions differ:

| Position | Source | Status |
|---|---|---|
| **Against** at feature level (tree-shaking and dev-performance problems) | [Bulletproof React](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) | ✅ |
| **For** at component-folder level (`index.ts` as a public API, not a re-export of everything) | [Robin Wieruch](https://www.robinwieruch.de/react-folder-structure/) · [Josh Comeau](https://www.joshwcomeau.com/react/file-structure/) | ✅ |
| Discussion in Next.js | [vercel/next.js Discussion #92926](https://github.com/vercel/next.js/discussions/92926) | 🔎 |
| Secondary (lower confidence): [ReactUse (DEV)](https://dev.to/childrentime/barrel-files-why-indexts-re-exports-hurt-tree-shaking-nextjs-dev-memory-and-tsc-2026-3kpm) · [Catch Metrics](https://www.catchmetrics.io/blog/nextjs-bundle-size-improvements-optimize-your-performance) · [DEV: adioof](https://dev.to/adioof/barrel-files-are-the-clean-code-habit-quietly-wrecking-your-bundle-1cn6) | | 🔎 |

## 8. Testing (relevant to where tests are colocated)

| # | Source | Level | Status | What we take |
|---|---|---|---|---|
| 8.1 | [Testing Library — Guiding Principles](https://testing-library.com/docs/guiding-principles/) | A | 🔎 | "The more your tests resemble the way your software is used, the more confidence they can give you"; work with DOM nodes, not component instances. |
| 8.2 | [Kent C. Dodds — The Testing Trophy](https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications) | B | 🔎 | Distribution of test types. |
| 8.3 | [Kent C. Dodds — Introducing react-testing-library](https://kentcdodds.com/blog/introducing-the-react-testing-library) | B | 🔎 | Motivation for not testing implementation details. |

---

## 9. Decisions and follow-ups

**Taken in skill v1.0.0** (rationale in the skill's
[README](../../.claude/skills/frontend-ui-architecture/README.md#design-decisions)):

1. Overlap with installed skills: the skill owns *organization* only; effects/memoization/keys
   stay in `react-best-practices`, Next APIs in `next-best-practices`, testing technique in
   `react-testing-library`.
2. Route-based organization for app code, function-based shared layers; promote on the second
   real consumer.
3. `constants.ts` beside the consumer; shared constants in a purpose-named `src/lib/` module;
   `helpers.ts` = project-specific, no `utils.ts`.
4. Barrels: one `index.ts` per component folder, none above that.
5. Next.js: SPA-style client is the norm here; DAL / Server Actions / BFF are reference only.

6. *(Owner decision, v1.2.0)* `AppShell` stays rendered per page — the page owns its
   breadcrumbs. Hosting persistent chrome in a layout (5.2) is the general Next.js advice,
   but it is a deliberate exception here.
7. *(Owner decision, v1.2.0)* No `features/` layer; route folders + `src/components` +
   `src/lib` suffice.

**Still open** (listed in the skill's `references/devdigest-client-mapping.md`):

1. Where app-wide constants go once the first cross-feature one appears.
2. Removing `'use client'` from `page.tsx` files that carry it (a refactor, not a drive-by).
3. Versions: sources were read on Next 16.3.5, the project is on Next 15.

**Follow-ups on research quality**

1. Re-read the 🔎 sources that back concrete rules (mainly 3.1, 4.2, 4.4, 4.5, 2.4, 3.6)
   before turning those rules into hard requirements.
2. Open Dan Abramov's article (4.8) through another channel — the direct fetch returned 403.
3. Topics not yet researched: error handling and Suspense/Error Boundaries, accessibility,
   forms (React Hook Form + Zod), i18n, styling (Tailwind v4), test naming.

---

## 10. Appendix: performance (out of the skill's scope)

Kept for completeness; **not used in the skill** — it is about architecture and code organization.

| # | Source | Level | Status | What it covers |
|---|---|---|---|---|
| 10.1 | [react.dev — React Compiler: Introduction](https://react.dev/learn/react-compiler/introduction) | A | ✅ | In new code rely on the compiler; `useMemo`/`useCallback`/`memo` only as an escape hatch (e.g. an Effect dependency). |
| 10.2 | [Vercel — How we optimized package imports in Next.js](https://vercel.com/blog/how-we-optimized-package-imports-in-next-js) | B | 🔎 | Barrel files and `optimizePackageImports` (for third-party libraries). |
