# reviewer-core — docs

**Detailed** design docs for `@devdigest/reviewer-core` that are too heavy for
[`../AGENTS.md`](../AGENTS.md) (which stays a short map). Add one Markdown file
per topic and link it below; Claude reads these on demand, not every session.

Good fits: prompt-assembly deep-dive, grounding-gate algorithm, structured-output
parse/repair, map-reduce path, prompt-slot design, ADRs.

## Index
- [`pipeline.md`](./pipeline.md) — the 5 stages: prompt → model → structured output → grounding → reduce
- _(add docs here, e.g. `prompt-assembly.md`)_
