import { fixtureReader, type SkillCase } from "../../src/index.js";

const fx = fixtureReader(import.meta.url);

/**
 * The model gets a report skeleton exactly as `report.mjs` renders it (trimmed to the sections
 * the agent must judge) and fills the `<!-- AGENT: … -->` markers — step 5 of the skill. The
 * facts are fixed, so every practice checks JUDGMENT: verdict scale, false positives, manager
 * per package, grouping, install-vs-bundle size, honesty about what was not checked.
 *
 * Fixtures hold no answers: nothing in them says postcss is a false positive, which package
 * uses which command, or that "not run" must not be reported as "no vulnerabilities".
 */
const fillPrompt = (fixture: string) => `You are at step 5 of a dependency audit. The collector and the report
renderer already ran; you cannot run commands or read files. Below is the rendered report skeleton.

Fill every \`<!-- AGENT: … -->\` section. Reply with ONLY the filled sections, in order, as Markdown,
each under its original heading: "## 1. Summary", "## 10. False positives", "## 11. Prioritized action plan",
"## 12. Recommendations".

<report>
${fx(fixture)}
</report>`;

export const cases: SkillCase[] = [
  {
    name: "fills the judgment sections of an audited report",
    kind: "quality",
    prompt: fillPrompt("skeleton-audited.md"),
    grounding: ["F01", "F07", "## 11"],
    practices: [
      "the summary opens with a one-line verdict of exactly 'at risk' (because a P0 finding exists)",
      "the action plan is a Markdown table whose columns include priority, action, cited finding IDs, impact, effort and a command",
      "the first action-plan row addresses the simple-git vulnerability (F01) as P0",
      "commands for the `api` and `web` packages use pnpm (for example `cd api && pnpm ...`), never npm",
      "commands for the `engine` package use npm (for example `npm ci` or `npm install`), never pnpm",
      "the vitest upgrades for api and web (F02, F03) are handled in a single grouped action row rather than two unrelated rows",
      "the postcss finding (F05) is listed as a false positive or explicitly marked as needing verification, instead of being planned as a plain removal",
      "the lucide-react finding (F06) is treated as install size rather than browser bundle size, and the answer does not recommend replacing lucide-react outright",
      "the answer presents commands as recommendations and never claims to have run, installed or removed anything",
      "the recommendations are grouped under Security, Size & performance, Consistency across packages, and Hygiene & process",
    ],
    threshold: 0.7,
    maxTurns: 2,
  },
  {
    name: "does not report 'no vulnerabilities' when the audit was not run",
    kind: "quality",
    prompt: fillPrompt("skeleton-offline.md"),
    grounding: ["F01"],
    practices: [
      "the summary opens with a one-line verdict of exactly 'needs attention' (a P1 exists, no P0)",
      "the answer states that security / vulnerabilities were not checked because the audit was not run, and never claims there are no vulnerabilities",
      "the answer recommends rerunning the collector with `--audit` (and/or `--outdated`) to check security",
      "the unused `p-retry` finding (F01) gets a pnpm command in the api package (e.g. `cd api && pnpm remove p-retry`)",
      "the pino-pretty finding (F02) is fixed by moving it to devDependencies, not by removing it",
      "the tools package fix for the loose `tsx` specifier (F04) uses npm, not pnpm",
    ],
    threshold: 0.7,
    maxTurns: 2,
  },
  {
    // Added after benchmark 2026-10-08T17-46: 9 of 16 practices above passed without the skill
    // too. This case has only P2/P3 findings, so every practice hinges on a skill-specific rule.
    name: "applies the skill's rules on a hygiene-only report",
    kind: "quality",
    prompt: fillPrompt("skeleton-hygiene.md"),
    grounding: ["F1", "F3"],
    practices: [
      "the summary opens with a one-line verdict of exactly 'healthy' (no P0/P1 findings and at most five P2 findings)",
      "the stray-install finding (F1) is fixed with a clean npm reinstall in the core package (`rm -rf node_modules && npm ci`), with no pnpm command for core",
      "the zod drift (F3) is resolved by choosing ONE target zod version for all three packages, not by upgrading core alone",
      "the mermaid finding (F2) recommends measuring the browser bundle and/or lazy-loading mermaid (e.g. `next/dynamic`) rather than replacing or removing mermaid",
      "the testcontainers finding (F5) is planned as low-priority hygiene and says that removing it frees no disk space because it stays installed via @testcontainers/postgresql",
      "the action plan ends with an 'After the plan' line that estimates reclaimed or remaining size in MB",
      "every command in the action plan starts with `cd <package> &&` (there is no workspace root)",
    ],
    threshold: 0.7,
    maxTurns: 2,
  },
];
