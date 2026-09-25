# client — specs

Behavior **specifications / contracts** for `@devdigest/web`: what a screen or
flow must do, independent of implementation. Linked (not preloaded) from
[`../AGENTS.md`](../AGENTS.md); Claude reads a spec when the task touches it.

Good fits: page/flow acceptance criteria, UI states, edge cases, a11y contracts.
(Executable browser journeys live in [`../../e2e/specs`](../../e2e/specs).)

## Index
- [`pages.md`](./pages.md) — route map + what each screen must show
- [`cost-attribution.md`](./cost-attribution.md) — run cost in PR list, timeline, trace
- [`severity-findings-filter.md`](./severity-findings-filter.md) — per-run severity counters + filter on PR detail
- [`conventions.md`](./conventions.md) — Conventions board, candidate triage, create-skill modal
- _(add specs here, e.g. `onboarding.md`)_
