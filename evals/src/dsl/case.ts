/**
 * Case types + the runners that turn a data array into vitest tests. This module owns the ONE
 * true measure → (log) → assert body, so case authors never rewrite it — which is exactly what
 * keeps the "assert before record" bug from recurring once record() lands (T2 slots into the
 * marked spot below, in this one file).
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "vitest";
import { DEFAULT_THRESHOLD } from "../config.js";
import { skillTask, agentTask, workflowTask } from "../tasks.js";
import { runClaude, type Result, type RunOptions } from "../runtime/run-claude.js";
import { patternMatch } from "../scoring/pattern-match.js";
import { llmJudge, type Verdict } from "../scoring/llm-judge.js";
import { logTrace, logVerdict } from "../logging/log.js";
import { record } from "../records/record.js";

// --- Case shapes ------------------------------------------------------------

/** A judge-and-grounding case. Same shape for skills and agents; only the task differs. */
export interface QualityCase {
  name: string;
  kind?: "quality" | "grounding";
  prompt: string;
  /** Practices the judge scores (quality). Omit for a pure grounding case. */
  practices?: string[];
  /** Substrings that must ALL appear before the judge runs (cheap-tier gate). */
  grounding?: string[];
  /** Judge score gate (default 0.6). */
  threshold?: number;
  maxTurns?: number;
}
export type SkillCase = QualityCase;
export type AgentCase = QualityCase;

/** A trace-asserted workflow case — a discriminated union routed by `kind`. */
export type WorkflowCase =
  | { kind: "dispatch"; name: string; prompt: string; expectSubagent: string; maxTurns?: number }
  | {
      kind: "activation";
      name: string;
      prompt: string;
      skill: string;
      shouldActivate: boolean;
      maxTurns?: number;
    }
  | {
      kind: "contrast";
      name: string;
      prompt: string;
      expectFileRead: string;
      tools?: string[];
      maxTurns?: number;
    }
  | ScenarioCase;

/**
 * Several checks over ONE real-harness session — so a bundle of related questions costs one
 * session instead of one per check. Trace checks (reads / not-reads) and judged answer checks
 * are merged into one per-check verdict, so repeat/delta still show WHICH check failed.
 * Don't bundle negatives with positives that legitimately trigger them, and don't bundle
 * skill activation / subagent dispatch — both change the rest of the session.
 */
export interface ScenarioCase {
  kind: "scenario";
  name: string;
  prompt: string;
  /** Path substrings that must appear among the files the session Read. */
  expectReads?: string[];
  /** Path substrings that must NOT appear among the files the session Read. */
  expectNotReads?: string[];
  /** Answer checks, scored by the judge on the session's final text. */
  practices?: string[];
  /** Also run the prompt in an empty dir with no on-disk config and judge the same practices.
   *  Stored on the record as `control` — it shows whether a practice needs the repo at all. */
  control?: boolean;
  /** Share of checks that must pass (default 0.75). */
  threshold?: number;
  /** Read-only by default: no Skill/Agent, so nothing else in the harness is dispatched. */
  tools?: string[];
  maxTurns?: number;
}

const SCENARIO_TOOLS = ["Read", "Grep", "Glob"];
const posixPath = (p: string) => p.replace(/\\/g, "/");

function traceChecks(c: ScenarioCase, result: Result): Verdict["results"] {
  const reads = result.filesRead.map(posixPath);
  const hit = (s: string) => reads.find((r) => r.includes(s));
  return [
    ...(c.expectReads ?? []).map((s) => ({
      practice: `reads ${s}`,
      passed: Boolean(hit(s)),
      evidence: hit(s) ?? `not read (reads: ${reads.length})`,
    })),
    ...(c.expectNotReads ?? []).map((s) => ({
      practice: `does not read ${s}`,
      passed: !hit(s),
      evidence: hit(s) ?? "not read",
    })),
  ];
}

async function runScenario(c: ScenarioCase): Promise<void> {
  const tools = c.tools ?? SCENARIO_TOOLS;
  const threshold = c.threshold ?? 0.75;
  const result = await workflowTask(c.prompt, { allowedTools: tools, maxTurns: c.maxTurns ?? 12 });
  logTrace(c.name, result);

  let verdict: Verdict | undefined;
  let control: Record<string, unknown> | undefined;
  try {
    const judged = c.practices?.length ? (await llmJudge(result.text, c.practices)).results : [];
    const results = [...traceChecks(c, result), ...judged];
    const passed = results.filter((r) => r.passed).length;
    verdict = { results, passed, total: results.length, score: results.length ? passed / results.length : 1 };
    logVerdict(c.name, verdict);

    if (c.control && c.practices?.length) {
      const emptyCwd = mkdtempSync(join(tmpdir(), "eval-control-"));
      const ctl = await runClaude(c.prompt, { allowedTools: tools, maxTurns: c.maxTurns ?? 12, cwd: emptyCwd, settingSources: [] });
      const ctlVerdict = await llmJudge(ctl.text, c.practices);
      logVerdict(`${c.name} [control]`, ctlVerdict);
      control = { score: ctlVerdict.score, results: ctlVerdict.results.map(({ practice, passed }) => ({ practice, passed })) };
    }
  } finally {
    // one record per scenario: the control rides along in `extra`, so it never pollutes the
    // treatment's per-practice pass rates (both would share one nodeid otherwise)
    record(c.name, { result, verdict, threshold, extra: control ? { control } : undefined });
  }

  expect(result.isError, "session ended in error").toBe(false);
  expect(verdict!.score, JSON.stringify(verdict!.results.filter((r) => !r.passed))).toBeGreaterThanOrEqual(threshold);
}

/** Did a skill engage? Either an explicit Skill tool-call, or reading its SKILL.md. */
export function activated(result: Result, skill: string): boolean {
  const bySkill = result.skillsInvoked.some((s) => s === skill || s.endsWith(`:${skill}`));
  const byRead = result.filesRead.some((f) => f.includes(`skills/${skill}/SKILL.md`));
  return bySkill || byRead;
}

// --- Runners ----------------------------------------------------------------

type Task = (prompt: string, artifact: string, opts?: RunOptions) => Promise<Result>;

function runQualityCases(artifact: string, cases: QualityCase[], task: Task): void {
  for (const c of cases) {
    test(c.name, async () => {
      const threshold = c.threshold ?? DEFAULT_THRESHOLD;
      const result = await task(c.prompt, artifact, { maxTurns: c.maxTurns });
      logTrace(c.name, result);

      // measure → record → assert. Everything measurable runs in the try; record() fires in the
      // finally with whatever accumulated; the asserts happen strictly after. A failing config
      // (e.g. baseline: grounding gate fails, judge skipped) still leaves a record.
      let grounded: number | undefined;
      let verdict: Verdict | undefined;
      try {
        // Cheap deterministic tier first — the grounding gate. When it fails the judge is skipped.
        if (c.grounding?.length) grounded = patternMatch(result.text, c.grounding);
        if (c.practices?.length && (grounded === undefined || grounded === 1)) {
          verdict = await llmJudge(result.text, c.practices);
          logVerdict(c.name, verdict);
        }
      } finally {
        record(c.name, { result, verdict, grounded, threshold });
      }

      if (grounded !== undefined) {
        expect(grounded, `missing concrete evidence; output:\n${result.text}`).toBe(1);
      }
      if (verdict) {
        expect(verdict.score, JSON.stringify(verdict.results)).toBeGreaterThanOrEqual(threshold);
      }
    });
  }
}

export const runSkillCases = (skill: string, cases: SkillCase[]) => runQualityCases(skill, cases, skillTask);
export const runAgentCases = (agent: string, cases: AgentCase[]) => runQualityCases(agent, cases, agentTask);

export function runWorkflowCases(cases: WorkflowCase[]): void {
  for (const c of cases) {
    test(c.name, async () => {
      if (c.kind === "scenario") {
        await runScenario(c);
      } else if (c.kind === "dispatch") {
        const result = await workflowTask(c.prompt, { maxTurns: c.maxTurns });
        logTrace(c.name, result);
        try {
          expect(result.subagents, `subagents: ${result.subagents.join(", ")}`).toContain(c.expectSubagent);
          expect(result.isError).toBe(false);
        } finally {
          record(c.name, { result });
        }
      } else if (c.kind === "activation") {
        const result = await workflowTask(c.prompt, { maxTurns: c.maxTurns });
        logTrace(c.name, result);
        try {
          expect(
            activated(result, c.skill),
            `skills: ${result.skillsInvoked.join(", ")} | reads: ${result.filesRead.join(", ")}`,
          ).toBe(c.shouldActivate);
        } finally {
          record(c.name, { result });
        }
      } else {
        // contrast: treatment (real harness) vs control (empty tmpdir, no on-disk config).
        const tools = c.tools ?? ["Read", "Grep", "Glob"];
        const treatment = await workflowTask(c.prompt, { allowedTools: tools, maxTurns: c.maxTurns });
        const emptyCwd = mkdtempSync(join(tmpdir(), "eval-control-"));
        const control = await runClaude(c.prompt, {
          allowedTools: tools,
          maxTurns: c.maxTurns,
          cwd: emptyCwd,
          settingSources: [],
        });
        logTrace(`${c.name} [treatment]`, treatment);
        logTrace(`${c.name} [control]`, control);
        try {
          const treatmentRead = treatment.filesRead.some((f) => f.includes(c.expectFileRead));
          const controlRead = control.filesRead.some((f) => f.includes(c.expectFileRead));
          expect(treatmentRead, `treatment reads: ${treatment.filesRead.join(", ")}`).toBe(true);
          expect(controlRead, `control reads: ${control.filesRead.join(", ")}`).toBe(false);
        } finally {
          record(`${c.name} [treatment]`, { result: treatment });
          record(`${c.name} [control]`, { result: control });
        }
      }
    });
  }
}
