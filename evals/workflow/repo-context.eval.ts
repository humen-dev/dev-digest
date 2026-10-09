import { describeWorkflow, runWorkflowCases } from "../src/index.js";
import { cases } from "./repo-context.cases.js";

describeWorkflow("repo-context", () => runWorkflowCases(cases));
