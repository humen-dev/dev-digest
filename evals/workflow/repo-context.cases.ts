import type { WorkflowCase } from "../src/index.js";

/**
 * Does the on-disk context (root AGENTS.md → package AGENTS.md → linked docs) actually reach
 * the agent? Related questions are bundled into `scenario` cases — one session each, many
 * checks — instead of one session per check. Facts in `practices` are chosen so they live ONLY
 * in a package AGENTS.md / linked doc (not in the root map), so the control run in an empty
 * directory should not know them.
 *
 * Kept separate on purpose: the no-preload negative (any doc read by a bundled question would
 * fail it) and skill activation / subagent dispatch (they change the rest of a session).
 */
export const cases: WorkflowCase[] = [
  // --- bundled scenarios ------------------------------------------------------------------
  {
    kind: "scenario",
    name: "server onboarding: session protocol, linked specs and server-only facts",
    prompt: `I'm about to work on the server: add a step to the PR review flow, plus an integration test for it that hits the database.
Before writing any code, follow this repo's conventions and give me a short plan that answers:
1. How does the review flow work end to end?
2. How is LLM cost attributed to a review?
3. How must the new DB-backed test file be named, and why?
4. Where does the server read the GitHub token from?
Do not write code.`,
    expectReads: ["server/INSIGHTS.md", "server/specs/review-flow.md", "server/specs/cost-attribution.md"],
    practices: [
      "says a test that uses the database (imports test/helpers/pg.ts) must be named `*.it.test.ts`",
      "says the GitHub token is read from `~/.devdigest/secrets.json` through `LocalSecretsProvider`, not from env vars or the database",
      "describes the review flow using concrete module or file names from this repository rather than a generic description",
      "explains cost attribution with details specific to this repository (e.g. where cost is recorded or how it is tied to a review), not a generic description",
    ],
    control: true,
  },
  {
    kind: "scenario",
    name: "client onboarding: linked UI docs and client-only facts",
    prompt: `I'm adding a new page to the web client that lists review findings with a severity filter.
Before writing any code, follow this repo's conventions and answer briefly:
1. Where do the page and its components go?
2. How should the page fetch data from the API?
3. Which env var sets the API base URL, and what is its default?
4. Do I need to start the API to run the client tests?
Do not write code.`,
    expectReads: ["client/docs/ui-architecture.md", "client/specs/severity-findings-filter.md", "client/INSIGHTS.md"],
    practices: [
      "says components live in a colocated `_components/<Name>/` folder and the page (`page.tsx`) stays thin",
      "says data is fetched through a hook in `src/lib/hooks/` that calls `src/lib/api.ts`, not with fetch inside components",
      "names `NEXT_PUBLIC_API_BASE` as the env var with default `http://localhost:3001`",
      "says client tests mock fetch, so the API does not need to be running",
    ],
    control: true,
  },
  {
    kind: "scenario",
    name: "repo gotchas: do-not-touch rules from the AGENTS.md maps",
    prompt: `Quick questions about this repo — answer each in one or two lines:
1. Can I reset the local database with \`docker compose down -v\`?
2. Which package manager do I use inside reviewer-core?
3. I want to change a Zod contract — can I edit the files under client/src/vendor/shared directly?
4. Can I fix a column type directly in an already-applied migration under server/src/db/migrations/?
5. Which lint command should I run before opening a PR?
6. I have a merge conflict in pnpm-lock.yaml — can I resolve it by hand?`,
    practices: [
      "warns that `-v` deletes the `devdigest_pgdata` volume (all imported repos and reviews) and advises against it",
      "says reviewer-core uses npm, not pnpm",
      "says not to edit the vendored copy under `src/vendor/shared` directly — edit at the source and keep copies in sync",
      "says applied migrations are never edited; the schema change goes into a new numbered migration",
      "says there is no separate ESLint step and the typecheck (`tsc --noEmit`) is the lint gate",
      "says lockfiles must not be hand-edited; regenerate them with the package manager",
    ],
    control: true,
  },
  {
    // Negative: a trivial question must not preload the deep docs ("don't preload" rule).
    kind: "scenario",
    name: "no preload: a trivial question reads no deep docs",
    prompt: "On which ports do the API and the web app run in local development? One line, please.",
    expectNotReads: ["/docs/", "/specs/", "README.md", "TESTING.md", "INSIGHTS.md"],
    practices: ["says the API runs on port 3001 and the web app on port 3000"],
    threshold: 1,
    maxTurns: 4,
  },

  // --- routing: one session per check -----------------------------------------------------
  {
    kind: "activation",
    name: "onion-architecture activates on backend structure work",
    prompt: "Plan a new server module `digests` with a route, a service and DB access — where should each file go? Plan only, no code.",
    skill: "onion-architecture",
    shouldActivate: true,
    maxTurns: 6,
  },
  {
    kind: "activation",
    name: "near-miss negative — a general question about onion architecture must NOT activate the skill",
    prompt: "In general terms, without looking at any repository, what is onion architecture? Three sentences.",
    skill: "onion-architecture",
    shouldActivate: false,
    maxTurns: 3,
  },
  {
    kind: "dispatch",
    name: "architecture check before a PR dispatches architecture-reviewer",
    prompt: "Before I open a PR, have the architecture reviewer subagent check that my local changes put files in the right layers.",
    expectSubagent: "architecture-reviewer",
    maxTurns: 4,
  },
];
