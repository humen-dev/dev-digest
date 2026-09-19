# Flows — spec (e2e)

The contract for an e2e flow. The runnable flows themselves live next to this file
as `NN-name.flow.json`; this document is the human-readable contract they follow.
Runner details: [`../docs/hermetic-stack.md`](../docs/hermetic-stack.md).

## Flow file
- Location/name: `specs/NN-name.flow.json` (ordered, two-digit prefix).
- Shape: a JSON object with ordered `steps`; each step has a `cmd` string passed
  **verbatim** to agent-browser, run in one session, top to bottom.
- A step's non-zero exit fails the whole flow (fail-fast).

## Allowed commands (deterministic only)
- Navigation/assertion: `wait --url <glob>`, `wait --text "<text>"`.
- Locators: `find role|text|label ...` then `click` / `type`.
- `{BASE}` expands to `E2E_BASE_URL`.
- **Forbidden:** the AI `chat` command, or any locator that depends on model
  reasoning — flows must be reproducible without a key.

## Assertion model
- There are no separate "expect" calls: `wait --text` / `wait --url` **are** the
  assertions. If the text/URL never appears, the step times out and the flow fails.

## Data assumptions
- Flows read the **seeded demo** only: repo `acme/payments-api`, PR #482. They must
  not create/mutate data, and must not assume any repo beyond the seed (flows
  `02/04/05` assume the demo repo is the only one).

## Adding a flow
1. Create `specs/NN-name.flow.json` with the next free `NN`.
2. Use only deterministic locators; assert with `wait`.
3. Run it under the hermetic stack (`npm run e2e:hermetic`).
4. Add a row to the coverage table in [`../README.md`](../README.md).
