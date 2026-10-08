# reviewer-core — specs

Behavior **specifications / contracts** for the review engine: the guarantees
the pipeline must uphold, independent of implementation. Linked (not preloaded)
from [`../AGENTS.md`](../AGENTS.md); read a spec when a task touches it.

Good fits: grounding guarantees, injection-defense contract, verdict/score rules,
structured-output schema expectations.

> Note: `specs` is also an optional **prompt slot** the engine accepts (fed from
> course lesson L05). These Markdown files are project specs, not that runtime slot.

New specs follow [`../../specs/_TEMPLATE.md`](../../specs/_TEMPLATE.md)
(`YYYY-MM-DD-<feature-slug>.md`, global `SPEC-NN`, EARS criteria) and are written
by the `spec-creator` agent; features spanning several modules go to the root
[`../../specs/`](../../specs/README.md) instead. Existing free-form specs below stay as they are.

## Index
- [`grounding-contract.md`](./grounding-contract.md) — citation gate, injection defense, deterministic verdict
- _(add specs here, e.g. `structured-output.md`)_
