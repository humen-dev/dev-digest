# Component anatomy

What goes in each file of a component folder, and how to decide when to split. Use this
when creating a component or when a file has grown several jobs.

## Contents
- One folder per component
- What each file holds
- Splitting a component
- Worked example
- Sources

## One folder per component

```
_components/AgentCard/
  AgentCard.tsx
  constants.ts
  helpers.ts
  styles.ts
  index.ts
  AgentCard.test.tsx
```

The folder groups everything that changes together (Kent C. Dodds' colocation:
"place code as close to where it's relevant as possible"); the named files give each
kind of code one predictable home. Josh Comeau and Robin Wieruch use the same shape —
`Component.tsx`, helpers, types, constants and an `index.ts` public API in one folder.
Create files only when the component has something to put in them.

## What each file holds

| File | Holds | Must not hold |
|---|---|---|
| `Name.tsx` | The component: composes JSX, wires hooks to markup, thin event handlers | Fetching, inline constants/maps, style objects, business rules |
| `constants.ts` | `UPPER_SNAKE` values, lookup maps, option lists, column keys | Functions with logic, JSX |
| `helpers.ts` | Pure functions: formatting, mapping, grouping, colour lookup. Data in, data out | React, hooks, I/O, `window` |
| `styles.ts` | Style objects exported as `s`; dynamic styles as functions (`s.card(active, enabled)`) | Logic beyond choosing a style |
| `hooks/` or `useX.ts` | View logic that needs React (form state, keyboard shortcuts, a filtering pipeline) | JSX |
| `reducer.ts` | Pure reducer for complex local state | Side effects (react.dev: reducers run during render) |
| `types.ts` | Types shared by 2+ files in the folder | Contracts that exist in `@devdigest/shared` |
| `_components/` | Sub-components used only by this one | Anything a second consumer needs — promote it |
| `Name.test.tsx` | Tests beside the code | — |
| `index.ts` | The public API: `export { Name } from "./Name"` | Re-exports of internals |

Notes:

- **Pure vs not.** Keeping `helpers.ts` free of React is what makes it trivially
  testable and reusable; anything that needs a hook belongs in a `use…` file.
- **A hook name means "calls hooks."** React's docs: a function that calls no hooks is
  not named `use…` (`getSorted`, not `useSorted`), so the prefix tells a reader where
  state and effects can hide.
- **Constants at module level.** Values that never change belong outside the component
  so they aren't recreated on every render and can be found by name.
- **Inline style objects.** A one-off dynamic style is acceptable inline; a static block
  belongs in `styles.ts`.
- A short header comment stating the component's responsibility is the repo style.

## Splitting a component

Split by **reason to change**. (Line and prop-count limits are in
`react-best-practices`; this section is about *where the seams are*.)

| Signal | Split into |
|---|---|
| The component fetches, routes and renders | Orchestrating container + presentational view (props in, JSX out) |
| A JSX block has its own props and is repeated or meaningful alone | Child in the nested `_components/` |
| A `useState` is used by one subtree only | Move state into that subtree ("push state down") |
| Several handlers mutate the same state object | `reducer.ts` + `useReducer` in a view hook |
| A group of constants or a pure function appears in the file | `constants.ts` / `helpers.ts` |

Guards against over-splitting:

- No wrapper that only forwards props.
- No extracted hook that would never have a second caller *and* has no name of its own
  worth reading — a hook should own something (state, or an effect wrapped in a
  purposeful name), not just rename a call.
- Keep sub-component nesting to **two levels** (Wieruch); deeper means promote or
  flatten.
- Container/presentational is a *separation of concerns*, not a mandatory file pair:
  React hooks now do most of what container components did (Patterns.dev: "Modern
  React strongly favors Hooks over container components"), and the pattern adds needless
  complexity in small components.

## Worked example

`app/agents/_components/AgentCard` is the model for a small component:

- `constants.ts` — `MODEL_COLOR` map.
- `helpers.ts` — `modelColor(model)` looks the colour up and falls back to a token.
- `styles.ts` — the `s` object with `s.card(active, enabled)`.
- `AgentCard.tsx` — imports the three above, calls `useDeleteAgent()` and renders.
- `index.ts` — `export { AgentCard, AgentCard as default } from "./AgentCard"`.

Larger example: `RunTraceDrawer/` adds `helpers.ts`, `constants.ts`, `styles.ts` and a nested
`_components/` folder (`TraceSection`, `ToolCallRow`, …) that only the drawer uses.

For where this component copies a pattern it shouldn't, see
[devdigest-client-mapping.md](devdigest-client-mapping.md).

## Sources

[Josh Comeau — file structure](https://www.joshwcomeau.com/react/file-structure/) ·
[Robin Wieruch — React folder structure](https://www.robinwieruch.de/react-folder-structure/) ·
[Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation) ·
[react.dev — Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks) ·
[react.dev — Extracting State Logic into a Reducer](https://react.dev/learn/extracting-state-logic-into-a-reducer) ·
[react.dev — Thinking in React](https://react.dev/learn/thinking-in-react) ·
[Patterns.dev — Container/Presentational](https://www.patterns.dev/react/presentational-container-pattern/) ·
[Vercel — composition-patterns](https://github.com/vercel-labs/agent-skills/tree/main/skills/composition-patterns).
Full list: [README.md](../README.md#sources).
