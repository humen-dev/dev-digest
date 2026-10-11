import { describeWorkflow, runWorkflowCases } from "../src/index.js";
import { cases } from "./dependency-checker-workflow.cases.js";

describeWorkflow("dependency-checker", () => runWorkflowCases(cases));
