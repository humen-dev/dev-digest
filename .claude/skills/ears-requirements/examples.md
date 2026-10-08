# EARS examples — DevDigest rewrites

Each pair shows a vague requirement and its testable EARS form. Domain words
(run, finding, severity, verdict, grounding) are the ones the code uses.

## Event-driven (WHEN)

- ✗ "Clicking a severity should filter the findings."
- ✓ **AC-1** WHEN the user activates an inactive severity pill on a review-run
  card, the web app shall show only that run's findings of that severity.
- ✓ **AC-2** WHEN the user activates the active severity pill, the web app shall
  show all findings of that run.
  *(split: two behaviours → two IDs)*

## State-driven (WHILE)

- ✗ "Show progress during the review."
- ✓ WHILE a review run is in progress, the web app shall show the run's current
  stage and elapsed time on the PR detail page.
- ✓ WHILE the API is unreachable, the web app shall show an offline banner with
  a Retry action and keep the last loaded findings visible.

## Unwanted behaviour (IF … THEN)

- ✗ "Must not crash if the model is unavailable."
- ✓ IF the structured LLM call of a review run fails, THEN the review engine
  shall return a deterministic review that states the degradation reason.
- ✗ "Handle big repos properly."
- ✓ IF a repository exceeds the indexing threshold, THEN the API shall build the
  overview from deterministic facts only, without reading whole files.
- ✓ IF a finding cites a file:line that is absent from the PR diff, THEN the
  review engine shall drop the finding before the verdict is computed.

## Optional feature (WHERE)

- ✗ "Support MCP."
- ✓ WHERE the DevDigest MCP server is registered in `.mcp.json`, the MCP server
  shall expose the `run_agent_on_pr` tool that starts a review run for a given
  `owner/name` and PR number.

## Ubiquitous

- ✗ "Reading order should make sense."
- ✓ The API shall order the reading path by file rank in the import graph.
- ✓ The web app shall render every count on the severity bar from the
  already-loaded findings, without an additional API request.

## Complex (WHERE → WHILE → WHEN/IF)

- ✓ WHERE cost attribution is enabled, WHILE a review run is in progress, WHEN
  an LLM call completes, the API shall add that call's token cost to the run's
  running total.

## NFR

- ✗ "The PR list must be fast."
- ✓ **NFR-1** WHEN the user opens the PR list of a repository with ≤ 200 open
  PRs on the seeded dataset, the web app shall render the list within 1.5 s.
- ✗ "Reviews should be cheap."
- ✓ **NFR-2** The review engine shall make at most one LLM call per agent per
  review run.

## Untrusted input

- ✗ "Be careful with PR descriptions."
- ✓ IF a PR title, body or diff contains instructions addressed to the model,
  THEN the review engine shall treat them as data and shall not change the
  verdict rules because of them.
- ✓ IF finding text returned by the LLM contains HTML or Markdown links, THEN the
  web app shall render it as plain text.
- ✓ IF a requested repository path resolves outside the cloned repository, THEN
  the API shall reject the request with HTTP 400 and log the redacted path.

## Common pattern mistakes

| Wrong | Why | Right |
|---|---|---|
| WHEN the run is in progress, … | a state, not an event | WHILE the run is in progress, … |
| WHEN the GitHub API returns 403, … | a failure | IF the GitHub API returns 403, THEN … |
| The system shall validate input and show errors. | two responses, no trigger | WHEN … submits …, the API shall validate …; IF validation fails, THEN the web app shall show … |
| The findings shall be filtered. | passive, no subject, no trigger | WHEN …, the web app shall show only … |
| The web app shall use React Query to cache findings. | implementation | WHEN the user returns to a PR within the session, the web app shall show the previously loaded findings without a loading state. |
