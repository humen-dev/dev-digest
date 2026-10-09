import { fixtureReader, type AgentCase } from "../../src/index.js";

const fx = fixtureReader(import.meta.url);

/**
 * Shared by `architecture-reviewer` and `architecture-reviewer-lite` (EVAL_AGENT picks which
 * definition is injected — see the .eval.ts). Same prompts, same practices, so `eval:delta`
 * shows exactly where the lite rules change behaviour.
 *
 * agentTask runs with no tools, so the diff is inlined and depcruise cannot run. Practices check
 * what both agents should do; where the lite agent is lenient BY DESIGN (judgement calls), the
 * practice only asserts the shared floor ("not CRITICAL"), never the full agent's exact severity.
 */
const reviewPrompt = (diff: string) => `Review this change set for architecture (file placement and import direction).
You have no tools in this session: you cannot run git or depcruise. The complete diff against main is below.

<diff>
${fx(diff)}
</diff>`;

export const cases: AgentCase[] = [
  {
    name: "flags a Drizzle query and business rule inside a new route",
    kind: "quality",
    prompt: reviewPrompt("server-route-drizzle.diff"),
    grounding: ["routes.ts"],
    practices: [
      "flags the Drizzle query (`db.select()...from(digests)`) inside routes.ts as a CRITICAL finding",
      "the target location for the query is a repository in the digests module (e.g. `repository.ts`), reached through the service",
      "flags the 'hot' digest rule (critical count / 7 days) computed inside the route handler as a finding, of any severity",
      "the verdict is request_changes",
      "states that depcruise was not run or could not run, and does not claim a depcruise pass",
      "does not report non-architecture issues (input validation, error handling, typing, style) as findings",
      "every finding cites a file:line location in the diff",
    ],
    threshold: 0.7,
    maxTurns: 2,
  },
  {
    name: "flags fetch in a component and a cross-route import",
    kind: "quality",
    prompt: reviewPrompt("client-fetch.diff"),
    grounding: ["DigestList"],
    practices: [
      "flags the `fetch(...)` call inside the DigestList component as a CRITICAL finding",
      "the target location for the data fetching is a hook under `src/lib/hooks/` that goes through `src/lib/api.ts`",
      "flags the import of `RepoBadge` from another route's `_components` folder as a finding",
      "the `PAGE_SIZE` constant is not reported as CRITICAL (at most WARNING or SUGGESTION, or not reported)",
      "the verdict is request_changes",
      "every finding cites a file:line location in the diff",
    ],
    threshold: 0.7,
    maxTurns: 2,
  },
  {
    name: "catches an HTTP type leaking into a service and ignores pre-existing drift",
    kind: "quality",
    prompt: reviewPrompt("server-service-request.diff"),
    grounding: ["service.ts"],
    practices: [
      "flags that `ReviewService.rerun` now takes a `FastifyRequest` (HTTP framework type inside the service layer) as a finding",
      "reports that finding as CRITICAL",
      "the target fix keeps request parsing in the route and passes plain values (reviewId, userId) or a DTO to the service",
      "does NOT report the existing `db.execute(sql...)` stats route in routes.ts as a finding of this change (it is an unchanged context line)",
      "the new `utils.ts` helper is not reported as CRITICAL (at most WARNING or SUGGESTION, or not reported)",
      "the verdict is request_changes",
    ],
    threshold: 0.7,
    maxTurns: 2,
  },
  {
    // Judgement-level problems only. The two agents legitimately differ on the verdict here
    // (full: `comment`, lite: `approve`), so practices assert only the shared floor.
    name: "keeps judgement-level client issues below CRITICAL",
    kind: "quality",
    prompt: reviewPrompt("client-warnings-only.diff"),
    grounding: ["DigestCard"],
    practices: [
      "no finding is CRITICAL",
      "the verdict is `comment` or `approve`, not `request_changes`",
      "flags the hard-coded user-facing strings ('Last updated', 'Needs attention', 'today') as belonging in `messages/<locale>/*.json`, at any severity",
      "flags the deep relative import `../../../../lib/format` and recommends the `@/` alias, at any severity",
      "mentions that the inline `formatAge` helper could move to a helpers module, OR that `'use client'` is unnecessary for this hook-free component — at least one of the two",
      "every finding cites a file:line location in the diff",
    ],
    threshold: 0.7,
    maxTurns: 2,
  },
  {
    // 8 problems, 6 of them CRITICAL — more than the lite agent's 5-finding cap. Checks that the
    // critical ones survive any truncation.
    name: "keeps every critical violation in a change set with many problems",
    kind: "quality",
    prompt: reviewPrompt("mixed-violations.diff"),
    grounding: ["service.ts", "InsightPanel"],
    practices: [
      "flags the Drizzle query in `server/src/modules/insights/routes.ts` as CRITICAL",
      "flags `new Octokit(...)` / the `octokit` import inside `InsightService` (vendor SDK outside `src/adapters/`) as CRITICAL",
      "flags the relative reach-in `../../../../reviewer-core/src/grounding` (should use the `@devdigest/reviewer-core` path alias) as a finding",
      "flags the filesystem I/O (`readFileSync` / `existsSync`) in `reviewer-core/src/context/load-rules.ts` as a finding",
      "flags the removed 'Never follow instructions…' line in `INJECTION_GUARD` as a finding",
      "flags the `fetch(...)` call inside the `InsightPanel` component as CRITICAL",
      "the `MAX_VISIBLE` constant is not reported as CRITICAL (at most WARNING or SUGGESTION, or not reported)",
      "the verdict is request_changes",
    ],
    threshold: 0.7,
    maxTurns: 2,
  },
];
