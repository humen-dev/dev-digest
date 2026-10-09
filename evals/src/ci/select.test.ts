import { describe, expect, test } from "vitest";
import { selectEvals, type Inventory } from "./select.js";

const inv: Inventory = {
  skills: ["dependency-checker"],
  agents: ["architecture-reviewer"],
  workflow: [
    { file: "workflow/dependency-checker-workflow.eval.ts", skills: ["dependency-checker"], agents: [] },
    { file: "workflow/repo-context.eval.ts", skills: [], agents: [] },
    { file: "workflow/review.eval.ts", skills: [], agents: ["architecture-reviewer"] },
  ],
};
const ALL_WORKFLOW = inv.workflow.map((w) => w.file).sort();

describe("selectEvals", () => {
  test("a skill change runs its skill evals and the workflow evals that activate it", () => {
    expect(selectEvals([".claude/skills/dependency-checker/SKILL.md"], inv).targets).toEqual([
      "skills/dependency-checker/",
      "workflow/dependency-checker-workflow.eval.ts",
    ]);
  });

  test("an agent change runs its agent evals and the workflow evals that dispatch it", () => {
    expect(selectEvals([".claude/agents/architecture-reviewer.md"], inv).targets).toEqual([
      "agents/architecture-reviewer/",
      "workflow/review.eval.ts",
    ]);
  });

  test("CLAUDE.md / AGENTS.md / settings / hooks run every workflow eval", () => {
    for (const f of ["CLAUDE.md", "server/AGENTS.md", ".claude/settings.json", ".claude/hooks/pr-gate.mjs"]) {
      expect(selectEvals([f], inv).targets, f).toEqual(ALL_WORKFLOW);
    }
  });

  test("a changed skill or agent without any eval is skipped", () => {
    const sel = selectEvals([".claude/skills/zod/SKILL.md", ".claude/agents/doc-writer.md"], inv);
    expect(sel.targets).toEqual([]);
    expect(sel.skipped).toEqual(["agent:doc-writer", "skill:zod"]);
  });

  test("agents/README.md is not an agent", () => {
    expect(selectEvals([".claude/agents/README.md"], inv)).toEqual({ targets: [], skipped: [] });
  });

  test("editing a case or fixture runs just that suite", () => {
    expect(
      selectEvals(
        ["evals/agents/architecture-reviewer/fixtures/x.diff", "evals/workflow/repo-context.cases.ts"],
        inv,
      ).targets,
    ).toEqual(["agents/architecture-reviewer/", "workflow/repo-context.eval.ts"]);
  });

  test("an engine change runs everything", () => {
    expect(selectEvals(["README.md", "evals/src/runtime/env.ts"], inv).targets).toHaveLength(5);
  });

  test("unrelated changes select nothing", () => {
    expect(selectEvals(["server/src/app.ts", "client/package.json"], inv).targets).toEqual([]);
  });

  test("an explicit scope ignores the diff", () => {
    expect(selectEvals([], inv, "agents").targets).toEqual(["agents/architecture-reviewer/"]);
    expect(selectEvals([], inv, "all").targets).toHaveLength(5);
  });
});
