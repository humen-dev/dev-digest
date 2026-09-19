# client — specs

Behavior **specifications / contracts** for `@devdigest/web`: what a screen or
flow must do, independent of implementation. Linked (not preloaded) from
[`../CLAUDE.md`](../CLAUDE.md); Claude reads a spec when the task touches it.

Good fits: page/flow acceptance criteria, UI states, edge cases, a11y contracts.
(Executable browser journeys live in [`../../e2e/specs`](../../e2e/specs).)

## Index
- [`cost-attribution.md`](./cost-attribution.md) — run cost in PR list, timeline, trace
- [`severity-findings-filter.md`](./severity-findings-filter.md) — aggregate severity counters + filter on PR detail
- _(add specs here, e.g. `pr-review-detail.md`, `onboarding.md`)_
