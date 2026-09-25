# frontend-ui-architecture

**Version 1.2.0** · created 2026-09-20 · scope: `client/` (Next.js App Router, React 19)

A skill for **UI architecture and code organization**: where components, hooks,
constants, helpers, styles, types, tests and business logic live; how to split a
component; which layers may import which; where the server/client boundary goes.

`SKILL.md` is what the agent loads. This README is for humans: motivation, design
decisions, versioning and the full list of sources.

## Why this skill exists (and what it deliberately does not repeat)

The repo already has skills for React runtime rules, Next.js APIs and testing. Repeating
their rules here would give two sources of truth that drift apart. This skill covers
only what none of them owns — **organization** — and links to the others.

| Topic | Owner |
|---|---|
| Organization: folders, file taxonomy, splitting, layers, boundary placement | **this skill** |
| Effects, derived state, memoization, keys, a11y, error boundaries, size limits | `react-best-practices` |
| Next.js APIs, RSC serialization errors, metadata, images, fonts | `next-best-practices` |
| Component testing technique | `react-testing-library` |
| Schemas | `zod` |
| How this app is wired | `client/docs/ui-architecture.md`, `client/AGENTS.md` |

## Contents

```
frontend-ui-architecture/
  SKILL.md                                   # rules, "where does X go" table, workflow, checklist
  README.md                                  # this file
  references/
    folder-structure.md                      # layers, promotion, naming, barrels, imports
    component-anatomy.md                     # per-file contents, splitting signals
    business-logic-layers.md                 # layers, state placement, hooks, reducers
    nextjs-app-router-architecture.md        # routes, layouts, boundary, providers, data
    devdigest-client-mapping.md              # real paths, drift, settled decisions
```

Progressive disclosure: `SKILL.md` (~150 lines) is loaded when the skill triggers; each
reference is read only when the task needs it.

## Design decisions

Where the sources disagree, the skill takes a position. The reasoning:

| Decision | Chosen | Why | Sources |
|---|---|---|---|
| Organize by feature or by function | **By route** for app code (Next's "split by feature or route"), **by function** for shared layers | Matches Next.js and the existing `client/` layout; function-based shared layers avoid category friction | 1.1, 1.5, 1.4 |
| When to share code | Promote on the **second real consumer**; wait for a third if the shape isn't obvious | Avoids both dumping-ground `shared/` and hasty abstractions | 1.4, 2.1, 2.4 |
| Dependency direction | `vendor` ← `lib` ← `components` ← `app`; no route→route imports | Keeps features deletable; enforceable | 1.2, 1.7 |
| Constants | `constants.ts` beside the consumer; shared → purpose-named `src/lib/` module | Colocation; FSD `config` idea without a new layer | 1.4, 1.5, 1.6 |
| Helpers vs utils | `helpers.ts` = project-specific beside consumer; generic → purpose-named module; **no `utils.ts`** | Purpose-based naming aids retrieval | 1.5, 1.6 |
| Barrels | One `index.ts` per component folder; none above that | Sources split: against at feature level (tree-shaking/dev perf), for at component level | 1.2, 1.4, 1.5, 7.x |
| Business logic | Layered: contracts → transport → server-state hooks → pure helpers → view hook → view → page | Pure functions are cheapest to test; hooks hold React-bound parts | 4.1–4.5, 4.9 |
| Container/presentational | Concern separation, not a mandatory file pair | Hooks replaced most container components | 4.7 |
| Server/client boundary | `'use client'` on the entry of each interactive subtree; pages/layouts stay thin | Next docs; boundary is a module-graph edge | 5.3, 5.4 |
| DAL / Server Actions / BFF | Reference only | The app uses a separate Fastify API through TanStack Query | 5.5–5.9 |
| Persistent chrome | General Next.js advice: host it in a layout. **DevDigest exception (owner decision):** `AppShell` stays per page | The page owns its breadcrumbs; accepted trade-off: the shell remounts on navigation. Layouts otherwise preserve state and hold loading UI | 5.2, 5.6 |
| `features/` layer | Not adopted (owner decision) | Route folders + `src/components` + `src/lib` suffice; revisit if several routes start sharing a domain | 1.2, 1.7 |
| Performance topics | Out of scope | Requested focus is architecture | §10 |

## Versioning

Semantic versioning, stored in `SKILL.md` frontmatter (`metadata.version`) and mirrored
here.

- **Patch** — wording, links, examples; no change in guidance.
- **Minor** — a rule added or clarified, a new reference, an updated mapping.
- **Major** — a rule reversed or a layer/dependency direction changed (existing code
  that was compliant may no longer be).

Bump the version in both files, and add a line below.

### History

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-09-20 | Initial release: six rules, placement table, four references, DevDigest mapping. |
| 1.1.0 | 2026-09-20 | Persistent chrome (shell/nav) belongs in a layout: added to the checklist; per-page `AppShell` reclassified from "open decision" to known drift; the remaining open question is how breadcrumbs reach a layout-hosted shell. |
| 1.2.0 | 2026-09-20 | Owner decisions recorded: `AppShell` stays rendered per page (a deliberate exception to the layout advice) and no `features/` layer. The 1.1.0 checklist item and drift entry for `AppShell` are removed; the general Next.js layout guidance stays in the Next reference. |

## Verification status of this skill

Frontmatter (name matches the folder, description 709/1024 characters, version present)
and all relative links were checked with an ad-hoc script; the official skill-creator
validator was not run because it needs PyYAML, which is not installed here. **No
behavioural evals have been run yet** (no with/without-skill comparison). Sources marked
🔎 below were located through search but not opened; rules that lean on them are stated
as principles rather than quotes. Re-read them before promoting any of those rules to a
hard requirement.

---

## Sources

Legend — **Level:** A official documentation · B recognised author or methodology · C
secondary. **Status:** ✅ opened and read · 🔎 found in search results only · ⚠️ could not
be opened. Numbers match the working registry
[`docs/skill-research/react-frontend-sources.md`](../../../docs/skill-research/react-frontend-sources.md).

### 1. Project structure

| # | Source | Level | Status |
|---|---|---|---|
| 1.1 | [Next.js — Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure) | A | ✅ |
| 1.2 | [Bulletproof React — project-structure.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) | B | ✅ |
| 1.3 | [Bulletproof React — repository](https://github.com/alan2207/bulletproof-react) | B | 🔎 |
| 1.4 | [Robin Wieruch — React Folder Structure Best Practices (2026)](https://www.robinwieruch.de/react-folder-structure/) | B | ✅ |
| 1.5 | [Josh Comeau — Delightful React File/Directory Structure](https://www.joshwcomeau.com/react/file-structure/) | B | ✅ |
| 1.6 | [Feature-Sliced Design — Slices and segments](https://feature-sliced.design/docs/reference/slices-segments) | B | ✅ |
| 1.7 | [Feature-Sliced Design — Layers](https://feature-sliced.design/docs/reference/layers) | B | 🔎 |
| 1.8 | [Feature-Sliced Design — Overview](https://feature-sliced.design/docs/get-started/overview) | B | 🔎 |
| 1.9 | [Feature-Sliced Design — documentation repository](https://github.com/feature-sliced/documentation) | B | 🔎 |
| 1.10 | [Sandro Roth — How to structure your React projects](https://sandroroth.com/blog/project-structure/) | B | 🔎 |
| 1.11 | [Tania Rascia — React architecture & directory structure](https://www.taniarascia.com/react-architecture-directory-structure/) | B | 🔎 |
| 1.12 | [Jack Franklin — Structuring React applications](https://www.jackfranklin.co.uk/blog/structuring-react-applications/) | B | 🔎 |
| 1.13 | [Web Dev Simplified — How To Structure React Projects](https://blog.webdevsimplified.com/2022-07/react-folder-structure/) | C | 🔎 |
| 1.14 | [Profy — Popular React Folder Structures and Screaming Architecture](https://profy.dev/article/react-folder-structure) | C | 🔎 |
| 1.15 | [React (legacy) — File Structure FAQ](https://legacy.reactjs.org/docs/faq-structure.html) | A | 🔎 |

### 2. Colocation and avoiding hasty abstraction

| # | Source | Level | Status |
|---|---|---|---|
| 2.1 | [Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation) | B | ✅ |
| 2.2 | [Kent C. Dodds — State Colocation will make your React app faster](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster) | B | 🔎 |
| 2.3 | [Kent C. Dodds — Application State Management with React](https://kentcdodds.com/blog/application-state-management-with-react) | B | 🔎 |
| 2.4 | [Kent C. Dodds — AHA Programming](https://kentcdodds.com/blog/aha-programming) | B | 🔎 |
| 2.5 | [Kent C. Dodds — AHA Programming (talk)](https://kentcdodds.com/talks/aha-programming) | B | 🔎 |
| 2.6 | [Next.js — Project Organization and File Colocation (v14 docs)](https://nextjs.org/docs/14/app/building-your-application/routing/colocation) | A | 🔎 |

### 3. Component decomposition

| # | Source | Level | Status |
|---|---|---|---|
| 3.1 | [react.dev — Thinking in React](https://react.dev/learn/thinking-in-react) | A | 🔎 |
| 3.2 | [react.dev — Thinking in React (raw .md)](https://react.dev/learn/thinking-in-react.md) | A | 🔎 |
| 3.3 | [react.dev — Components and Hooks must be pure](https://react.dev/reference/rules/components-and-hooks-must-be-pure) | A | 🔎 |
| 3.4 | [react.dev — Rules of React](https://react.dev/reference/rules) | A | 🔎 |
| 3.5 | [Vercel — composition-patterns (agent skill)](https://github.com/vercel-labs/agent-skills/tree/main/skills/composition-patterns) | B | ✅ |
| 3.6 | [Vercel — react-best-practices AGENTS.md](https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/AGENTS.md) | B | 🔎 |
| 3.7 | [Vercel — Introducing: React Best Practices](https://vercel.com/blog/introducing-react-best-practices) | B | 🔎 |
| 3.8 | [Vercel — agent-skills repository](https://github.com/vercel-labs/agent-skills) | B | 🔎 |
| 3.9 | [React TypeScript Cheatsheet](https://react-typescript-cheatsheet.netlify.app/) | B | 🔎 |
| 3.10 | [React TypeScript Cheatsheet — patterns by use case](https://github.com/typescript-cheatsheets/react/blob/main/docs/advanced/patterns_by_usecase.md) | B | 🔎 |

### 4. Business logic, hooks, state

| # | Source | Level | Status |
|---|---|---|---|
| 4.1 | [react.dev — Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks) | A | ✅ |
| 4.2 | [react.dev — You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) | A | 🔎 |
| 4.3 | [react.dev — Extracting State Logic into a Reducer](https://react.dev/learn/extracting-state-logic-into-a-reducer) | A | ✅ |
| 4.4 | [react.dev — Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure) | A | 🔎 |
| 4.5 | [react.dev — Sharing State Between Components](https://react.dev/learn/sharing-state-between-components) | A | 🔎 |
| 4.6 | [react.dev — Managing State](https://react.dev/learn/managing-state) | A | 🔎 |
| 4.7 | [Patterns.dev — Container/Presentational Pattern](https://www.patterns.dev/react/presentational-container-pattern/) | B | ✅ |
| 4.8 | [Dan Abramov — Presentational and Container Components](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0) (mirror: [readmedium](https://readmedium.com/smart-and-dumb-components-7ca2f9a7c7d0)) | B | ⚠️ 403 — content not verified; the skill does not rely on it |
| 4.9 | [TkDodo — The Query Options API](https://tkdodo.eu/blog/the-query-options-api) | B | ✅ |
| 4.10 | [TkDodo — Practical React Query](https://tkdodo.eu/blog/practical-react-query) | B | 🔎 |
| 4.11 | [TanStack Query — Discussion #8547: layered architecture](https://github.com/TanStack/query/discussions/8547) | B | 🔎 |
| 4.12 | [Felix Gerschau — Separation of concerns with React hooks](https://felixgerschau.com/react-hooks-separation-of-concerns/) | C | 🔎 |
| 4.13 | [TSH — Container-presentational pattern in React](https://tsh.io/blog/container-presentational-pattern-react) | C | 🔎 |
| 4.14 | [Martin Buchalik — The Controller Pattern](https://medium.com/@MBuchalik/the-controller-pattern-separate-business-logic-from-presentation-in-react-331f72fcb32a) | C | 🔎 |
| 4.15 | [Frontend Patterns — Presentational vs Container](https://frontendpatterns.dev/presentational-vs-container/) | C | 🔎 |

### 5. Next.js App Router architecture (docs v16.3.5; `client/` is on Next 15)

| # | Source | Level | Status |
|---|---|---|---|
| 5.1 | [Next.js — Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure) (same as 1.1) | A | ✅ |
| 5.2 | [Next.js — Layouts and Pages](https://nextjs.org/docs/app/getting-started/layouts-and-pages) | A | ✅ |
| 5.3 | [Next.js — Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) | A | ✅ |
| 5.4 | [Next.js — The Server and Client Boundary](https://nextjs.org/docs/app/guides/server-and-client-boundary) | A | ✅ |
| 5.5 | [Next.js — Data security (Data Access Layer)](https://nextjs.org/docs/app/guides/data-security) | A | ✅ |
| 5.6 | [Next.js — Fetching Data](https://nextjs.org/docs/app/getting-started/fetching-data) | A | ✅ |
| 5.7 | [Next.js — Mutating Data](https://nextjs.org/docs/app/getting-started/mutating-data) | A | ✅ |
| 5.8 | [Next.js — Backend for Frontend](https://nextjs.org/docs/app/guides/backend-for-frontend) | A | ✅ |
| 5.9 | [Next.js — Single-Page Applications](https://nextjs.org/docs/app/guides/single-page-applications) | A | ✅ |
| 5.10 | [Next.js — Client-side data fetching](https://nextjs.org/docs/app/guides/client-side-data-fetching) | A | 🔎 |
| 5.11 | [vercel-labs/next-spa-patterns (demo)](https://github.com/vercel-labs/next-spa-patterns) | B | 🔎 |
| 5.12 | [Next.js — Server Actions and Mutations](https://nextjs.org/docs/app/guides/server-actions) | A | 🔎 |
| 5.13 | [Next.js — Authentication](https://nextjs.org/docs/app/guides/authentication) | A | 🔎 |
| 5.14 | [Next.js — Rendering Philosophy](https://nextjs.org/docs/app/guides/rendering-philosophy) | A | 🔎 |
| 5.15 | [Next.js — Building interactive apps](https://nextjs.org/docs/app/guides/interactive-apps) | A | 🔎 |
| 5.16 | [Next.js — Composition Patterns (v14 docs)](https://nextjs.org/docs/14/app/building-your-application/rendering/composition-patterns) | A | 🔎 |
| 5.17 | [Next.js Learn — Server and Client Components](https://nextjs.org/learn/react-foundations/server-and-client-components) | A | 🔎 |

### 7. Barrel files (`index.ts`)

| # | Source | Level | Status |
|---|---|---|---|
| 7.1 | Bulletproof React — against feature-level barrels: see 1.2 | B | ✅ |
| 7.2 | For component-level `index.ts`: see 1.4 and 1.5 | B | ✅ |
| 7.3 | [vercel/next.js Discussion #92926 — Barrel imports](https://github.com/vercel/next.js/discussions/92926) | B | 🔎 |
| 7.4 | [ReactUse — Barrel Files: Why index.ts Re-Exports Hurt Tree Shaking (DEV)](https://dev.to/childrentime/barrel-files-why-indexts-re-exports-hurt-tree-shaking-nextjs-dev-memory-and-tsc-2026-3kpm) | C | 🔎 |
| 7.5 | [Catch Metrics — Next.js Barrel Files Bundle Size Improvements](https://www.catchmetrics.io/blog/nextjs-bundle-size-improvements-optimize-your-performance) | C | 🔎 |
| 7.6 | [DEV — Barrel files are the clean-code habit quietly wrecking your bundle](https://dev.to/adioof/barrel-files-are-the-clean-code-habit-quietly-wrecking-your-bundle-1cn6) | C | 🔎 |

### 8. Testing (placement of tests)

| # | Source | Level | Status |
|---|---|---|---|
| 8.1 | [Testing Library — Guiding Principles](https://testing-library.com/docs/guiding-principles/) | A | 🔎 |
| 8.2 | [Kent C. Dodds — The Testing Trophy and Testing Classifications](https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications) | B | 🔎 |
| 8.3 | [Kent C. Dodds — Introducing react-testing-library](https://kentcdodds.com/blog/introducing-the-react-testing-library) | B | 🔎 |

### 10. Out of scope (performance) — kept for completeness

| # | Source | Level | Status |
|---|---|---|---|
| 10.1 | [react.dev — React Compiler: Introduction](https://react.dev/learn/react-compiler/introduction) | A | ✅ |
| 10.2 | [Vercel — How we optimized package imports in Next.js](https://vercel.com/blog/how-we-optimized-package-imports-in-next-js) | B | 🔎 |

### Repository sources used for the DevDigest mapping

- [`client/AGENTS.md`](../../../client/AGENTS.md) — conventions and map
- [`client/docs/ui-architecture.md`](../../../client/docs/ui-architecture.md) — how the app is wired
- [`client/INSIGHTS.md`](../../../client/INSIGHTS.md) — accumulated learnings
- `client/src/app/agents/_components/AgentCard/*` — reference component shape
- `client/src/app/repos/[repoId]/pulls/page.tsx` — example of drift (see mapping)
- `client/src/lib/{api.ts,hooks/*,providers.tsx}`, `client/src/app/layout.tsx`, `client/tsconfig.json`
- Existing skills for scope boundaries: `react-best-practices`, `next-best-practices`

### Note on numbering

Numbers keep the numbering of the working registry so the two can be compared; the gap
between 5 and 7 (and the missing 6 and 9) exists because the registry's performance
section moved to §10 and its "decisions" section is process notes, not sources.
