import type { WorkflowCase } from "../src/index.js";

/**
 * Does the real harness reach for dependency-checker? One positive (the user's own words, no
 * skill name) and one near-miss negative: same vocabulary ("package", "client"), but an install
 * request — which the skill's description explicitly excludes ("it only recommends").
 */
export const cases: WorkflowCase[] = [
  {
    kind: "activation",
    name: "dependency-checker activates on a node_modules size / unused-deps question",
    prompt:
      "Our installs are slow and node_modules in client and server is huge. Which of our dependencies are the heaviest or unused across the packages, and what should we clean up first?",
    skill: "dependency-checker",
    shouldActivate: true,
    maxTurns: 4,
  },
  {
    kind: "activation",
    name: "near-miss negative — adding one package must NOT activate dependency-checker",
    prompt: "Add the date-fns package to the client so I can format review timestamps. Just tell me the command.",
    skill: "dependency-checker",
    shouldActivate: false,
    maxTurns: 4,
  },
];
