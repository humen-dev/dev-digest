/**
 * CI entry for eval selection: `tsx src/ci/select-cli.ts [--base <ref>] [--scope auto|all|…]`.
 *
 * Diffs <base>...HEAD, builds the inventory from disk (eval dirs, agent variants.json, what each
 * workflow cases file checks), prints the selection, logs SKIP for changed skills/agents without
 * evals and, under GitHub Actions, writes the matrix inputs to $GITHUB_OUTPUT:
 *   skills   = JSON array of skill names
 *   agents   = JSON array of { agent, dir }
 *   workflow = space-separated workflow eval files ("" = no workflow job)
 */

import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
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
  // agents/<dir>/ grades the agent named <dir>, plus any variants listed in its variants.json
  const agents = subdirs(join(EVALS_DIR, "agents")).flatMap((dir) => {
    const variantsFile = join(EVALS_DIR, "agents", dir, "variants.json");
    const variants: string[] = existsSync(variantsFile) ? JSON.parse(readFileSync(variantsFile, "utf8")) : [];
    return [dir, ...variants].map((agent) => ({ agent, dir }));
  });
  return { skills: subdirs(join(EVALS_DIR, "skills")), agents, workflow };
}

function changedFiles(base: string): string[] {
  const out = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], { cwd: REPO_ROOT, encoding: "utf8" });
  return out.split("\n").map((s) => s.trim()).filter(Boolean);
}

const scope = (arg("scope") || "auto") as Scope;
const base = arg("base") || "origin/main";
const changed = scope === "auto" ? changedFiles(base) : [];
const sel = selectEvals(changed, await inventory(), scope);

const list = (xs: string[]) => (xs.length ? xs.join(", ") : "—");
console.log(`scope: ${scope}${scope === "auto" ? ` (base ${base}, ${changed.length} changed files)` : ""}`);
console.log(`skills:   ${list(sel.skills)}`);
console.log(`agents:   ${list(sel.agents.map((a) => (a.agent === a.dir ? a.agent : `${a.agent} (on agents/${a.dir}/)`)))}`);
console.log(`workflow: ${list(sel.workflow)}`);
for (const s of sel.skipped) console.log(`SKIP ${s} — changed, but has no evals`);

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `skills=${JSON.stringify(sel.skills)}\nagents=${JSON.stringify(sel.agents)}\nworkflow=${sel.workflow.join(" ")}\n`,
  );
}
