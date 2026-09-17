# reviewer-core — `@devdigest/reviewer-core` (map, not docs)

Context injected every session. Keep it a **map**: stack, commands, where things
live, non-default conventions, gotchas. Everything deep is a **link** below —
Claude reads those files only when a task touches them. Keep ≤100 lines.

## Stack
Pure TypeScript · zod · openai SDK. **No DB / GitHub / filesystem** — the only
side effect is an injected `LLMProvider`. `"type": "module"`.

## Commands
- `npm test` — vitest, hermetic (stubbed `LLMProvider`; no keys, no network)
- `npm run typecheck` — **doubles as the build**; the package never emits JS

## Where things live
- `prompt.ts` — `assemblePrompt` / `wrapUntrusted` / `INJECTION_GUARD`
- `grounding.ts` — `groundFindings` / `groundingSummary` (the citation gate)
- `output/` — structured LLM output (Zod → JSON Schema, parse-with-repair)
- `llm/` — the `LLMProvider` implementations (openrouter)
- `review/run.ts` — orchestrates a run (single-pass by default)
- `index.ts` — public API surface

## Conventions (non-default)
- Consumed as **source**, not a built package: server & CI import it via tsconfig
  path alias (`@devdigest/reviewer-core` → `../reviewer-core/src`).
- `LLMProvider` is always **injected** — that is what makes it mock-testable.
- Contracts (`Review`, `Finding`, `Verdict`, …) come from `@devdigest/shared`.

## Gotchas / do-not-touch
- **Grounding gate is mandatory & security-critical:** a finding that doesn't
  cite a real diff line is dropped; the score is recomputed from survivors, never
  trusted from the model. Don't weaken or bypass it.
- `INJECTION_GUARD` is appended to **every** agent prompt — untrusted content is
  data, never instructions. Don't add keyword/denylist scanning instead.
- Optional prompt slots (`skills` / `memory` / `specs` / `callers`) are omitted
  in the starter — `assemblePrompt` just leaves those sections out.

## Deeper context — read the file when the task touches it (don't preload)
- [`README.md`](./README.md) — overview + pipeline diagram
- [`docs/`](./docs/) — detailed design docs (architecture, deep dives)
- [`specs/`](./specs/) — behavior specs / engine contracts
- [`INSIGHTS.md`](./INSIGHTS.md) — accumulated gotchas & non-obvious learnings
- [`../TESTING.md`](../TESTING.md) — cross-package test strategy
