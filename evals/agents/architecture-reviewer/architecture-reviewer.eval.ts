import { describeAgent, runAgentCases } from "../../src/index.js";
import { cases } from "./architecture-reviewer.cases.js";

// One eval file for both variants: the describe name stays "architecture-reviewer" so test ids
// are identical and `eval:delta` can line the two series up. EVAL_AGENT picks the definition:
//   EVAL_AGENT=architecture-reviewer       pnpm eval:repeat agents/architecture-reviewer -n 3 --label full
//   EVAL_AGENT=architecture-reviewer-lite  pnpm eval:repeat agents/architecture-reviewer -n 3 --label lite
//   pnpm eval:delta full lite
const agent = process.env.EVAL_AGENT ?? "architecture-reviewer";

describeAgent("architecture-reviewer", () => runAgentCases(agent, cases));
