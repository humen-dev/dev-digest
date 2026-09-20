# e2e — specs (flows)

The executable e2e **flows** for the web app. Each `NN-name.flow.json` is an
ordered list of agent-browser commands run against one shared session by
[`../run.ts`](../run.ts). Linked (not preloaded) from [`../AGENTS.md`](../AGENTS.md).

Format & conventions: [`flows.md`](./flows.md) (the flow-file contract) and
[`../README.md`](../README.md) ("How a flow works"). Deterministic locators only
(`--url` / `--text` / `find role|text|label`); `wait --text` / `wait --url` are the
assertions. Target read-only seeded data.

## Flows
| Spec | Flow |
|------|------|
| `01-app-boot` | root → redirect to first repo's PR list → seeded PR #482 |
| `02-repo-pulls-detail` | PR list → open PR #482 → review detail route |
| `03-agents` | agents list renders the seeded reviewer agents |
| `04-pr-findings` | PR #482 → Agent runs tab → verdict + findings → FindingCard |
| `05-pr-diff` | PR #482 → Files changed tab → seeded file in the diff viewer |
| `06-onboarding` | `/onboarding` → add-repository form renders (no submit) |
| `07-settings` | `/settings/api-keys` + `/settings/models` → section titles |
