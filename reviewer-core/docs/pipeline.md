# reviewer-core — pipeline (`@devdigest/reviewer-core`)

The pure review engine: diff in, grounded `ReviewOutcome` out, with **no** DB /
GitHub / filesystem access — the only side effect is the injected `LLMProvider`.
Read alongside the map in [`../AGENTS.md`](../AGENTS.md).

## Stages (one run)
1. **Assemble prompt** — `prompt.ts` `assemblePrompt(...)` builds the agent prompt.
   Untrusted content (diff, PR text, comments) is wrapped via `wrapUntrusted` and
   the `INJECTION_GUARD` is appended to **every** prompt: untrusted text is data,
   never instructions. Optional slots (`skills` / `memory` / `specs` / `callers`)
   are simply omitted when absent in the starter.
2. **Call the model** — through the injected `LLMProvider` (`llm/`, e.g.
   openrouter). Injection is what makes the engine mock-testable with no keys/network.
3. **Structured output** — `output/` turns the model response into typed findings
   (Zod schema → JSON Schema for forced tool-use, with parse-with-repair for minor
   malformations).
4. **Grounding gate** — `grounding.ts` `groundFindings(...)`: a diff-finding whose
   `start_line..end_line` does not intersect a real diff hunk is **dropped**. The
   score is then **recomputed from the survivors**, never trusted from the model.
   `groundingSummary(...)` reports what was kept/dropped.
5. **Reduce to a review** — `output/to-review.ts` produces the verdict/score and
   deterministic counts: `SEV_RANK`, `severityCounts`, and `countBlockers(findings,
   failOn)` (findings whose severity rank ≥ the `ciFailOn` gate).

`review/run.ts` orchestrates the above (single-pass by default; map-reduce over diff
chunks for large PRs, summing `apiCostUsd`). `index.ts` is the public surface.

## Contracts
`Review`, `Finding`, `Verdict`, `Severity`, … come from `@devdigest/shared`
(resolved to `server/src/vendor/shared`). The engine adds no persistence types.

## Why it's pure
Keeping the engine side-effect-free lets the server **and** the CI runner share the
exact same review logic, and lets tests run hermetically with a stubbed provider.
See the guarantees in [`../specs/grounding-contract.md`](../specs/grounding-contract.md).
