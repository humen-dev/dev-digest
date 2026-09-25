# Folder structure

Where files live in `client/src`, how code moves between layers, and how to import it.
Use this when the question is "where does this new file or module belong?".

## The layers

```
client/src/
  app/                          # routes: thin page.tsx / layout.tsx + colocated private code
    <route>/
      page.tsx                  # wiring only
      _components/<Name>/       # views/components used by THIS route
      constants.ts, helpers.ts, styles.ts   # route-level code shared by the route's components
  components/                   # shared UI used by 2+ routes (app-shell, diff-viewer, page-shell, …)
    <group>/<Name>/
  lib/                          # non-visual shared code
    api.ts                      # transport (the only place that talks HTTP)
    hooks/<domain>.ts           # server-state hooks (+ index.ts)
    <purpose>.ts                # format-cost.ts, github-urls.ts, model-label.ts, …
    *.tsx                       # cross-cutting providers: theme, toast, repo-context, providers
  vendor/                       # vendored @devdigest/ui and @devdigest/shared — never edit here
messages/<locale>/<namespace>.json
```

**Dependency direction:** `vendor/*` ← `lib` ← `components` ← `app`. Each layer may
import only from layers to its left.

Why it matters: when dependencies point one way, deleting or moving a feature cannot
break something that "reached in" from the side. Bulletproof React states the same
rule as `shared → features → app` and enforces it with ESLint
`import/no-restricted-paths`; this repo has no separate `features/` layer, so the route
folder plays that role.

Extra rule inside `app/`: a route never imports from another route's `_components`.
If two routes need it, promote it (next section).

## Promotion ladder

Move code up only when a **second real consumer** appears:

1. inside the component file →
2. a sibling file in the component folder (`constants.ts`, `helpers.ts`, …) →
3. route level (`app/<route>/helpers.ts`, `app/<route>/_components/`) — shared by
   several components of one route →
4. `src/components/<group>/` (UI) or `src/lib/<purpose>.ts` (non-UI) — shared by
   several routes.

The rule of thumb from the sources: if exactly one feature uses a util it lives inside
that feature; once two or more need it, it moves to the shared layer (Robin Wieruch).
Kent C. Dodds adds the counterweight (AHA — avoid hasty abstractions): duplication is
cheaper than the wrong abstraction, so if the two uses only look alike, wait for the
third before extracting.

## Organizing by route vs by feature

Next.js documents three strategies and calls the choice a matter of preference — the
only rule is to pick one and stay consistent: files outside `app/`, top-level folders
inside `app/`, or **splitting by feature or route**. DevDigest uses the third, plus a
shared `components/` and `lib/`. Josh Comeau's function-based layout (`components/`,
`hooks/`, `helpers/`, constants) is the model for the *shared* layers. A separate
`features/` layer (Bulletproof, Feature-Sliced Design) is **not adopted here** (owner
decision, see [devdigest-client-mapping.md](devdigest-client-mapping.md)); revisit only if
several routes start sharing a domain.

## Naming

| Thing | Convention |
|---|---|
| Component folder | `PascalCase/` with `Name.tsx` and `index.ts` |
| Hook file | `useThing.ts` (one hook) or `<domain>.ts` in `lib/hooks` (a domain's hooks) |
| Constants | `UPPER_SNAKE` values in `constants.ts` |
| Shared non-UI module | kebab-case, named by what it does: `format-cost.ts` |
| Tests | `Name.test.tsx` / `thing.test.ts` beside the file |

**Purpose over form.** Feature-Sliced Design warns that segment names like
`components`, `hooks`, `types` "aren't that helpful when you're looking for code". Apply
that to *shared* modules: prefer `format-cost.ts` to `utils.ts`. Inside a component
folder the fixed names (`constants.ts`, `helpers.ts`, `styles.ts`) are fine because the
folder already tells you the domain.

**Helper vs utility.** Josh Comeau separates a *helper* (specific to this project) from
a *utility* (a generic function). Here that maps to: project/domain logic →
`helpers.ts` beside its consumer; generic and reusable → a purpose-named module in
`src/lib/`.

## Barrels (`index.ts`)

- Keep **one `index.ts` per component folder** as its public API
  (`export { AgentCard } from "./AgentCard"`).
- Do **not** add barrels that gather many folders (`components/index.ts`) or chains of
  `export *`. Bulletproof React drops feature-level barrels because they hurt tree
  shaking and dev performance; Comeau and Wieruch keep them at the component-folder level.
  Both positions agree on this split.
- `src/lib/hooks/index.ts` already exists and is tolerated; new code imports the domain
  file directly (`@/lib/hooks/agents`) so the dependency is explicit.

## Import rules

- Anything that leaves the component's own folder uses the `@/` alias
  (`@/lib/hooks/agents`, `@/components/app-shell`). Deep relative chains like
  `../../../../lib/hooks/agents` break silently when a folder moves.
- Relative imports (`./`, one `../`) only within the same component folder.
- Import from another folder through its `index.ts`, never into its internals.
- Do not mass-rewrite existing relative imports as part of unrelated work.

## Anti-patterns

| Smell | Why it hurts | Instead |
|---|---|---|
| `utils.ts` / `common/` / `misc` | Grows without limit; nothing says what belongs | Purpose-named module |
| Route A imports `app/routeB/_components/X` | Hidden coupling between routes | Promote X to `src/components` |
| Shared folder for a single consumer | Speculative; hides who owns it | Keep it beside the consumer |
| Flat `components/` with dozens of files | Nothing groups related code | `components/<group>/<Name>/` |
| One `types/` folder for everything | Types get separated from what they describe | Colocate; contracts in `@devdigest/shared` |
| Barrel of barrels | Cycles, slow dev server | One `index.ts` per component |

## Sources

Next.js — [Project structure](https://nextjs.org/docs/app/getting-started/project-structure) ·
[Bulletproof React — project structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) ·
[Robin Wieruch — React folder structure](https://www.robinwieruch.de/react-folder-structure/) ·
[Josh Comeau — file structure](https://www.joshwcomeau.com/react/file-structure/) ·
[Feature-Sliced Design — slices and segments](https://feature-sliced.design/docs/reference/slices-segments) ·
[Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation) ·
[Kent C. Dodds — AHA Programming](https://kentcdodds.com/blog/aha-programming).
Full list with verification status: [README.md](../README.md#sources).
