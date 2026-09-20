# Where business logic lives

Layers for moving logic out of JSX, and where each kind of state and rule belongs. Use
this when a component has grown conditions, derived data, or server calls.

React *runtime* rules (derive-don't-store, effect misuse, memoization) are owned by
`react-best-practices` — this file only decides **where code lives**.

## Contents
- The layers
- State placement
- Hooks: what earns a file
- Reducers
- Validation and contracts
- Example: from thick view to layers
- Anti-patterns
- Sources

## The layers

Each layer calls only the layer below it.

| # | Layer | Lives in | Responsibility | Knows about |
|---|---|---|---|---|
| 1 | Contracts | `@devdigest/shared` (vendored Zod schemas/types) | Shape of data crossing the API | nothing |
| 2 | Transport | `src/lib/api.ts` | The only code that talks HTTP; `api.get/post/put/…`; `ApiError` | contracts |
| 3 | Server-state hooks | `src/lib/hooks/<domain>.ts` | Query key + fetch fn + invalidation for one domain | transport |
| 4 | Pure domain logic | `<Name>/helpers.ts`, route `helpers.ts`, `src/lib/<purpose>.ts` | Format, map, group, filter, sort, pick — data in, data out | contracts |
| 5 | View hooks | `<Name>/hooks/*` or `use<Thing>.ts` | Compose 3 + 4 with UI state; return a ready-to-render view model | 3, 4 |
| 6 | View | `<Name>/Name.tsx` | Render; thin handlers that call into 5 | 5 (and 4 for tiny formatting) |
| 7 | Page | `app/<route>/page.tsx` | Read route params, place the view | 6 |

Why the split: pure functions (layer 4) are the cheapest thing to test and reuse;
hooks (3, 5) hold the parts that need React; JSX (6) stays readable because it only
describes structure. A component that calls `api` directly cannot be tested without a
network mock and cannot share the logic.

## State placement

Choose the lowest level that works; move up only when forced.

1. **Derived** — not state. Compute during render from props/state (react.dev: don't
   store what you can calculate; store an id, not a duplicated object).
2. **Local `useState`** — in the component that uses it, or its nearest owner.
3. **Lifted** — to the nearest common parent when two siblings must agree; each piece of
   state has one owner (react.dev, single source of truth).
4. **URL search params** — for shareable or bookmarkable view state such as filters,
   sort, and tab. (Per `react-best-practices`.)
5. **Provider/context** — only for cross-cutting concerns already in `src/lib/*.tsx`
   (theme, toast, active repo). Not a general global store.
6. **Server state** — lives in TanStack Query. Never copy it into `useState`; derive from
   the query result instead.

Kent C. Dodds' framing: keep **server cache** and **UI state** as two distinct kinds
and colocate the UI state near where it is used.

## Hooks: what earns a file

- A hook should **own something**: a query key, a fetch function and its invalidation
  (`useUpdateAgent` sets the cache entry and invalidates the list), or UI state.
  TkDodo's warning applies: a hook that only forwards to `useQuery` and adds nothing is
  indirection, not abstraction.
- Name it for the **concrete use case** (`useChatRoom`, `useFilteredPulls`), never a
  lifecycle wrapper such as `useMount` (react.dev).
- Prefix `use` only if it calls hooks; a plain function is `getSorted`, not `useSorted`.
- Whenever you write an Effect, consider wrapping it in a named hook (react.dev), then
  keep that hook beside the component unless a second caller appears.
- Query key and fetch function stay **side by side**: the key lists the fn's
  dependencies, so separating them invites stale-cache bugs. `queryOptions` factories are
  a valid step up if reuse (prefetch, imperative reads) appears.
- Domain hooks live in `src/lib/hooks/<domain>.ts` and are marked `"use client"`.

## Reducers

Reach for `useReducer` + `reducer.ts` when several handlers change the same state in
different ways or transitions are easy to get wrong. The reducer is a **pure** function
(no fetching, no timers) so it can be tested with no React; one action should describe
one user interaction (`reset_form`, not five `set_field_n`) (react.dev).

## Validation and contracts

- Contracts and schemas come from `@devdigest/shared`; do not redeclare them in a
  component or hook file.
- Validate at the boundary where untrusted data enters, not scattered across components.
  Zod specifics: see the `zod` skill.
- Cross-field UI rules (what enables a button) are pure helpers, not conditions
  repeated in JSX.

## Example: from thick view to layers

Before — one file fetches, filters, sorts, counts and renders:

```tsx
export default function PullsPage() {
  const { data: pulls } = usePulls(repoId);
  const filtered = (pulls ?? []).filter(/* status + text */).sort(/* by date */);
  const openCount = (pulls ?? []).filter((p) => OPEN_STATUSES.has(p.status)).length;
  return /* 60 lines of JSX using filtered + openCount */;
}
```

After — each concern in its home (illustrative names):

```
app/repos/[repoId]/pulls/
  page.tsx                          # reads params, renders <PullsListView repoId=…/>
  constants.ts                      # OPEN_STATUSES, COLUMN_KEYS
  helpers.ts                        # filterPulls(pulls, {status, query}), sortPulls(pulls, order), countOpen(pulls)
  _components/PullsListView/
    PullsListView.tsx               # renders; no filtering logic
    usePullsListState.ts            # usePulls + URL status + local query/sort → { rows, counts, handlers }
```

`helpers.ts` functions are pure and unit-testable; the hook owns UI state; the view
only renders.

## Anti-patterns

| Smell | Instead |
|---|---|
| `fetch`/`api.*` inside a component | A hook in `src/lib/hooks/<domain>.ts` |
| Filter/sort/group written inline in JSX or the page body | Pure function in `helpers.ts`, called from a view hook |
| Server data copied into `useState` "to edit it" | Keep the query result; hold only the draft in state |
| A hook that just re-exports `useQuery(...)` | Call `useQuery` directly, or make the hook own invalidation/derivation |
| Business constant (`OPEN_STATUSES`) declared mid-file | `constants.ts` |
| A "manager" context holding server data | TanStack Query cache |
| Effects for logic that belongs in an event handler | See `react-best-practices` |

## Sources

[react.dev — Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks) ·
[react.dev — Extracting State Logic into a Reducer](https://react.dev/learn/extracting-state-logic-into-a-reducer) ·
[react.dev — Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure) ·
[react.dev — Sharing State Between Components](https://react.dev/learn/sharing-state-between-components) ·
[react.dev — You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) ·
[TkDodo — The Query Options API](https://tkdodo.eu/blog/the-query-options-api) ·
[Kent C. Dodds — Application State Management with React](https://kentcdodds.com/blog/application-state-management-with-react) ·
[Kent C. Dodds — State Colocation](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster) ·
[Feature-Sliced Design — slices and segments](https://feature-sliced.design/docs/reference/slices-segments) (`model` vs `api` vs `lib` split) ·
[Patterns.dev — Container/Presentational](https://www.patterns.dev/react/presentational-container-pattern/).
Full list: [README.md](../README.md#sources).
