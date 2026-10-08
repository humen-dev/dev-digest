# server — specs

Behavior **specifications / contracts** for `@devdigest/api`: endpoint contracts,
invariants, and error envelopes, independent of implementation. Linked (not
preloaded) from [`../AGENTS.md`](../AGENTS.md); read a spec when a task touches it.

Good fits: route request/response contracts, validation & error-envelope rules,
rate-limit policy, security invariants (grounding, injection guard).

New specs follow [`../../specs/_TEMPLATE.md`](../../specs/_TEMPLATE.md)
(`YYYY-MM-DD-<feature-slug>.md`, global `SPEC-NN`, EARS criteria) and are written
by the `spec-creator` agent; features spanning several modules go to the root
[`../../specs/`](../../specs/README.md) instead. Existing free-form specs below stay as they are.

## Index
- [`review-flow.md`](./review-flow.md) — review trigger, per-run lifecycle, determinism guarantees
- [`cost-attribution.md`](./cost-attribution.md) — run cost persistence + API contracts
- [`conventions.md`](./conventions.md) — conventions extractor: sample → propose → evidence gate → skill
- [`intent-layer.md`](./intent-layer.md) — PR intent + scope classifier: sources → classify → persist → scope filter
- [`smart-diff.md`](./smart-diff.md) — file-role classifier (L08 entry point) + `GET /pulls/:id/smart-diff`
- _(add specs here, e.g. `error-envelope.md`)_
