/**
 * CI entry for eval selection: `tsx src/ci/select-cli.ts [--base <ref>] [--scope auto|all|…]`.
 *
 * Diffs <base>...HEAD, builds the inventory from disk (eval dirs + what each workflow cases file
 * checks), prints the selection, logs SKIP for changed skills/agents without evals and,
 * under GitHub Actions, writes `targets` (space-separated vitest filters) and `run` to
 * $GITHUB_OUTPUT.
 */

import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { EVALS_DIR, REPO_ROOT } from "../artifacts/paths.js";
import type { WorkflowCase } from "../dsl/case.js";
import { selectEvals, type Inventory, type Scope } from "./select.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function subdirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((d) => statSync(join(dir, d)).isDirectory());
}

async function inventory(): Promise<Inventory> {
  const wfDir = join(EVALS_DIR, "workflow");
  const workflow = [];
  for (const f of existsSync(wfDir) ? readdirSync(wfDir) : []) {
    if (!f.endsWith(".eval.ts")) continue;
    const casesFile = join(wfDir, f.replace(/\.eval\.ts$/, ".cases.ts"));
    // cases files import only types from the barrel, so loading them does not pull in vitest
    const cases: WorkflowCase[] = existsSync(casesFile)
      ? ((await import(pathToFileURL(casesFile).href)).cases ?? [])
      : [];
    workflow.push({
      file: `workflow/${f}`,
      skills: cases.flatMap((c) => (c.kind === "activation" ? [c.skill] : [])),
      agents: cases.flatMap((c) => (c.kind === "dispatch" ? [c.expectSubagent] : [])),
    });
  }
  return {
    skills: subdirs(join(EVALS_DIR, "skills")),
    agents: subdirs(join(EVALS_DIR, "agents")),
    workflow,
  };
}

function changedFiles(base: string): string[] {
  const out = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], { cwd: REPO_ROOT, encoding: "utf8" });
  return out.split("\n").map((s) => s.trim()).filter(Boolean);
}

const scope = (arg("scope") || "auto") as Scope;
const base = arg("base") || "origin/main";
const changed = scope === "auto" ? changedFiles(base) : [];
const { targets, skipped } = selectEvals(changed, await inventory(), scope);

console.log(`scope: ${scope}${scope === "auto" ? ` (base ${base}, ${changed.length} changed files)` : ""}`);
console.log(targets.length ? `evals to run:\n  ${targets.join("\n  ")}` : "no evals to run");
for (const s of skipped) console.log(`SKIP ${s} — changed, but has no evals`);

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `targets=${targets.join(" ")}\nrun=${targets.length > 0}\n`);
}
