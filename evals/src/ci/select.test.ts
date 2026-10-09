import { describe, expect, test } from "vitest";
import { selectEvals, type Inventory } from "./select.js";

const AR = { agent: "architecture-reviewer", dir: "architecture-reviewer" };
const AR_LITE = { agent: "architecture-reviewer-lite", dir: "architecture-reviewer" };

const inv: Inventory = {
  skills: ["dependency-checker"],
  agents: [AR, AR_LITE],
  workflow: [
    { file: "workflow/dependency-checker-workflow.eval.ts", skills: ["dependency-checker"], agents: [] },
    { file: "workflow/repo-context.eval.ts", skills: [], agents: [] },
    { file: "workflow/review.eval.ts", skills: [], agents: ["architecture-reviewer"] },
  ],
};
const ALL_WORKFLOW = inv.workflow.map((w) => w.file).sort();
const none = { skills: [], agents: [], workflow: [], skipped: [] };

describe("selectEvals", () => {
  test("a skill change runs its skill job and the workflow evals that activate it", () => {
    expect(selectEvals([".claude/skills/dependency-checker/SKILL.md"], inv)).toEqual({
      ...none,
      skills: ["dependency-checker"],
      workflow: ["workflow/dependency-checker-workflow.eval.ts"],
    });
  });

  test("an agent change runs its agent job and the workflow evals that dispatch it", () => {
    expect(selectEvals([".claude/agents/architecture-reviewer.md"], inv)).toEqual({
      ...none,
      agents: [AR],
      workflow: ["workflow/review.eval.ts"],
    });
  });

  test("a variant agent runs on its shared eval dir, on its own", () => {
    expect(selectEvals([".claude/agents/architecture-reviewer-lite.md"], inv)).toEqual({
      ...none,
      agents: [AR_LITE],
    });
  });

  test("CLAUDE.md / AGENTS.md / settings / hooks run every workflow eval", () => {
    for (const f of ["CLAUDE.md", "server/AGENTS.md", ".claude/settings.json", ".claude/hooks/pr-gate.mjs"]) {
      expect(selectEvals([f], inv), f).toEqual({ ...none, workflow: ALL_WORKFLOW });
    }
  });

  test("a changed skill or agent without any eval is skipped", () => {
    expect(selectEvals([".claude/skills/zod/SKILL.md", ".claude/agents/doc-writer.md"], inv)).toEqual({
      ...none,
      skipped: ["agent:doc-writer", "skill:zod"],
    });
  });

  test("agents/README.md is not an agent", () => {
    expect(selectEvals([".claude/agents/README.md"], inv)).toEqual(none);
  });

  test("editing cases or fixtures runs just that suite — every agent of a shared dir", () => {
    expect(
      selectEvals(
        ["evals/agents/architecture-reviewer/fixtures/x.diff", "evals/workflow/repo-context.cases.ts"],
        inv,
      ),
    ).toEqual({ ...none, agents: [AR, AR_LITE], workflow: ["workflow/repo-context.eval.ts"] });
  });

  test("an engine change runs everything", () => {
    expect(selectEvals(["README.md", "evals/src/runtime/env.ts"], inv)).toEqual({
      skills: ["dependency-checker"],
      agents: [AR, AR_LITE],
      workflow: ALL_WORKFLOW,
      skipped: [],
    });
  });

  test("unrelated changes select nothing", () => {
    expect(selectEvals(["server/src/app.ts", "client/package.json"], inv)).toEqual(none);
  });

  test("an explicit scope ignores the diff", () => {
    expect(selectEvals([], inv, "agents")).toEqual({ ...none, agents: [AR, AR_LITE] });
    expect(selectEvals([], inv, "all").workflow).toEqual(ALL_WORKFLOW);
  });
});
