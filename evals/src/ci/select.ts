/**
 * Changed files → which evals to run. Pure: the caller supplies the changed paths (repo-relative,
 * POSIX) and an inventory of what evals exist; no git, no fs, no model — so it is unit-tested.
 *
 *   .claude/skills/<name>/**      → evals/skills/<name>/ + workflow evals that activate <name>
 *   .claude/agents/<name>.md      → evals/agents/<name>/ + workflow evals that dispatch <name>
 *   CLAUDE.md, AGENTS.md (any dir), .claude/settings.json, .claude/hooks/**
 *                                 → every workflow eval (the harness as a whole changed)
 *   evals/{skills,agents}/<name>/** → that eval dir;  evals/workflow/<file> → that workflow eval
 *   the eval engine itself (evals/src, package.json, lockfile, configs, proxy/, the CI workflow)
 *                                 → everything
 *   a changed skill/agent with no eval of any tier → not run, reported in `skipped`
 *
 * Targets are vitest filters relative to evals/ (substring match on the file path), so a dir
 * target keeps its trailing slash: "skills/zod/" must not also match "skills/zod-extra/".
 */

export interface WorkflowEvalInfo {
  /** vitest filter, e.g. "workflow/repo-context.eval.ts" */
  file: string;
  /** Skills whose activation the file checks. */
  skills: string[];
  /** Subagents whose dispatch the file checks. */
  agents: string[];
}

export interface Inventory {
  /** Skill names that have an evals/skills/<name>/ dir. */
  skills: string[];
  /** Agent names that have an evals/agents/<name>/ dir. */
  agents: string[];
  workflow: WorkflowEvalInfo[];
}

export type Scope = "auto" | "all" | "skills" | "agents" | "workflow";

export interface Selection {
  targets: string[];
  /** Skills/agents that changed but have no eval of any tier — not run, logged as SKIP. */
  skipped: string[];
}

const ENGINE_FILES = [
  /^evals\/src\//,
  /^evals\/(package\.json|pnpm-lock\.yaml|vitest\.config\.ts|tsconfig\.json)$/,
  /^evals\/proxy\//,
  /^\.github\/workflows\/evals\.yml$/,
];
const HARNESS_FILES = [
  /(^|\/)CLAUDE\.md$/,
  /(^|\/)AGENTS\.md$/,
  /^\.claude\/settings\.json$/,
  /^\.claude\/hooks\//,
];

const skillTarget = (name: string) => `skills/${name}/`;
const agentTarget = (name: string) => `agents/${name}/`;

export function allTargets(inv: Inventory, scope: Exclude<Scope, "auto"> = "all"): string[] {
  const out: string[] = [];
  if (scope === "all" || scope === "skills") out.push(...inv.skills.map(skillTarget));
  if (scope === "all" || scope === "agents") out.push(...inv.agents.map(agentTarget));
  if (scope === "all" || scope === "workflow") out.push(...inv.workflow.map((w) => w.file));
  return out;
}

export function selectEvals(changed: string[], inv: Inventory, scope: Scope = "auto"): Selection {
  if (scope !== "auto") return { targets: allTargets(inv, scope), skipped: [] };

  const targets = new Set<string>();
  const skipped = new Set<string>();
  const add = (t: string[]) => t.forEach((x) => targets.add(x));

  for (const raw of changed) {
    const path = raw.replace(/\\/g, "/");

    if (ENGINE_FILES.some((re) => re.test(path))) return { targets: allTargets(inv), skipped: [] };

    if (HARNESS_FILES.some((re) => re.test(path))) {
      add(inv.workflow.map((w) => w.file));
      continue;
    }

    const skill = path.match(/^\.claude\/skills\/([^/]+)\//)?.[1];
    if (skill) {
      const hits = [
        ...(inv.skills.includes(skill) ? [skillTarget(skill)] : []),
        ...inv.workflow.filter((w) => w.skills.includes(skill)).map((w) => w.file),
      ];
      if (hits.length) add(hits);
      else skipped.add(`skill:${skill}`);
      continue;
    }

    const agent = path.match(/^\.claude\/agents\/([^/]+)\.md$/)?.[1];
    if (agent && agent !== "README") {
      const hits = [
        ...(inv.agents.includes(agent) ? [agentTarget(agent)] : []),
        ...inv.workflow.filter((w) => w.agents.includes(agent)).map((w) => w.file),
      ];
      if (hits.length) add(hits);
      else skipped.add(`agent:${agent}`);
      continue;
    }

    const evalDir = path.match(/^evals\/(skills|agents)\/([^/]+)\//);
    if (evalDir) {
      targets.add(`${evalDir[1]}/${evalDir[2]}/`);
      continue;
    }

    const wf = path.match(/^evals\/workflow\/([^/]+?)\.(eval|cases)\.ts$/);
    if (wf) targets.add(`workflow/${wf[1]}.eval.ts`);
  }

  return { targets: [...targets].sort(), skipped: [...skipped].sort() };
}
