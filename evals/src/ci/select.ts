/**
 * Changed files → which evals to run, shaped for the CI matrix: one job per skill, one per agent,
 * one for the workflow tier. Pure: the caller supplies the changed paths (repo-relative, POSIX)
 * and an inventory of what evals exist; no git, no fs, no model — so it is unit-tested.
 *
 *   .claude/skills/<name>/**      → skill <name> + workflow evals that activate <name>
 *   .claude/agents/<name>.md      → agent <name> + workflow evals that dispatch <name>
 *   CLAUDE.md, AGENTS.md (any dir), .claude/settings.json, .claude/hooks/**
 *                                 → every workflow eval (the harness as a whole changed)
 *   evals/skills/<name>/**        → skill <name>;  evals/agents/<dir>/** → every agent of <dir>
 *   evals/workflow/<file>         → that workflow eval
 *   the eval engine itself (evals/src, package.json, lockfile, configs, proxy/, the CI workflow)
 *                                 → everything
 *   a changed skill/agent with no eval of any tier → not run, reported in `skipped`
 *
 * One agent eval dir can serve several agents: `evals/agents/<dir>/variants.json` lists the extra
 * agent definitions its cases also grade (injected via EVAL_AGENT), e.g. a lite variant.
 */

export interface WorkflowEvalInfo {
  /** vitest filter, e.g. "workflow/repo-context.eval.ts" */
  file: string;
  /** Skills whose activation the file checks. */
  skills: string[];
  /** Subagents whose dispatch the file checks. */
  agents: string[];
}

/** One agent graded by one eval dir: run as `EVAL_AGENT=<agent> vitest run agents/<dir>/`. */
export interface AgentTarget {
  agent: string;
  dir: string;
}

export interface Inventory {
  /** Skill names that have an evals/skills/<name>/ dir. */
  skills: string[];
  /** Every agent with an eval dir (the dir's own agent + its variants). */
  agents: AgentTarget[];
  workflow: WorkflowEvalInfo[];
}

export type Scope = "auto" | "all" | "skills" | "agents" | "workflow";

export interface Selection {
  skills: string[];
  agents: AgentTarget[];
  /** Workflow eval files (vitest filters). */
  workflow: string[];
  /** Skills/agents that changed but have no eval of any tier — not run, logged as SKIP. */
  skipped: string[];
}

const ENGINE_FILES = [
  /^evals\/src\//,
  /^evals\/(package\.json|pnpm-lock\.yaml|vitest\.config\.ts|tsconfig\.json)$/,
  /^evals\/proxy\//,
  /^\.github\/workflows\/evals\.yml$/,
  /^\.github\/actions\/evals-setup\//,
];
const HARNESS_FILES = [
  /(^|\/)CLAUDE\.md$/,
  /(^|\/)AGENTS\.md$/,
  /^\.claude\/settings\.json$/,
  /^\.claude\/hooks\//,
];

export function selectAll(inv: Inventory, scope: Exclude<Scope, "auto"> = "all"): Selection {
  const has = (s: Scope) => scope === "all" || scope === s;
  return {
    skills: has("skills") ? [...inv.skills].sort() : [],
    agents: has("agents") ? sortAgents(inv.agents) : [],
    workflow: has("workflow") ? inv.workflow.map((w) => w.file).sort() : [],
    skipped: [],
  };
}

const sortAgents = (a: AgentTarget[]) => [...a].sort((x, y) => x.agent.localeCompare(y.agent));

export function selectEvals(changed: string[], inv: Inventory, scope: Scope = "auto"): Selection {
  if (scope !== "auto") return selectAll(inv, scope);

  const skills = new Set<string>();
  const agents = new Map<string, AgentTarget>();
  const workflow = new Set<string>();
  const skipped = new Set<string>();
  const addWorkflow = (files: string[]) => files.forEach((f) => workflow.add(f));

  for (const raw of changed) {
    const path = raw.replace(/\\/g, "/");

    if (ENGINE_FILES.some((re) => re.test(path))) return selectAll(inv);

    if (HARNESS_FILES.some((re) => re.test(path))) {
      addWorkflow(inv.workflow.map((w) => w.file));
      continue;
    }

    const skill = path.match(/^\.claude\/skills\/([^/]+)\//)?.[1];
    if (skill) {
      const wf = inv.workflow.filter((w) => w.skills.includes(skill)).map((w) => w.file);
      if (inv.skills.includes(skill)) skills.add(skill);
      addWorkflow(wf);
      if (!inv.skills.includes(skill) && !wf.length) skipped.add(`skill:${skill}`);
      continue;
    }

    const agent = path.match(/^\.claude\/agents\/([^/]+)\.md$/)?.[1];
    if (agent && agent !== "README") {
      const own = inv.agents.find((a) => a.agent === agent);
      const wf = inv.workflow.filter((w) => w.agents.includes(agent)).map((w) => w.file);
      if (own) agents.set(own.agent, own);
      addWorkflow(wf);
      if (!own && !wf.length) skipped.add(`agent:${agent}`);
      continue;
    }

    const skillDir = path.match(/^evals\/skills\/([^/]+)\//)?.[1];
    if (skillDir) {
      if (inv.skills.includes(skillDir)) skills.add(skillDir);
      continue;
    }

    const agentDir = path.match(/^evals\/agents\/([^/]+)\//)?.[1];
    if (agentDir) {
      for (const a of inv.agents.filter((x) => x.dir === agentDir)) agents.set(a.agent, a);
      continue;
    }

    const wf = path.match(/^evals\/workflow\/([^/]+?)\.(eval|cases)\.ts$/);
    if (wf) workflow.add(`workflow/${wf[1]}.eval.ts`);
  }

  return {
    skills: [...skills].sort(),
    agents: sortAgents([...agents.values()]),
    workflow: [...workflow].sort(),
    skipped: [...skipped].sort(),
  };
}
