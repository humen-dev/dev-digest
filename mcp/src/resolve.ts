// src/resolve.ts — ring 2: human-readable id resolution against the DevDigestApi port.
// Turns the flat, human-typed tool arguments (repo string, pr number, agent name/id)
// into the concrete API entities, or throws a ToolError with an actionable `next`.
import { ToolError } from './errors.js';
import type { ApiAgent, ApiPull, ApiRepo } from './domain/types.js';
import type { DevDigestApi } from './ports.js';

const GITHUB_URL_RE = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i;
const PLAIN_REPO_RE = /^([^/\s]+)\/([^/\s]+)$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_LIST_ITEMS = 10;

/** Strips control characters and clips echoed user input to 100 chars (security: never echo raw untrusted input). */
function clipEcho(text: string): string {
  // eslint-disable-next-line no-control-regex
  const stripped = text.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim();
  return stripped.length > 100 ? `${stripped.slice(0, 100)}…` : stripped;
}

/** Joins up to 10 items; appends `…` when more exist. */
function capList(items: string[]): string {
  if (items.length === 0) return '(none)';
  const shown = items.slice(0, MAX_LIST_ITEMS).join(', ');
  return items.length > MAX_LIST_ITEMS ? `${shown}, …` : shown;
}

/**
 * Parses the `repo` tool argument. Accepts "owner/name", a GitHub URL
 * ("https://github.com/owner/name(.git)(/)") or a schemeless "github.com/owner/name".
 */
export function parseRepoArg(repo: string): { owner: string; name: string } {
  const trimmed = repo.trim();
  const urlMatch = GITHUB_URL_RE.exec(trimmed);
  if (urlMatch) {
    const owner = urlMatch[1]!;
    const name = urlMatch[2]!;
    return { owner, name };
  }
  const plainMatch = PLAIN_REPO_RE.exec(trimmed);
  if (plainMatch) {
    const owner = plainMatch[1]!;
    const name = plainMatch[2]!;
    if (owner.toLowerCase() !== 'github.com') return { owner, name };
  }
  throw new ToolError('invalid_argument', `Invalid repo "${clipEcho(repo)}".`, 'Pass repo as "owner/name".');
}

/** Resolves the `repo` argument to an imported ApiRepo (case-insensitive full_name match). */
export async function resolveRepo(api: DevDigestApi, repo: string): Promise<ApiRepo> {
  const { owner, name } = parseRepoArg(repo);
  const target = `${owner}/${name}`.toLowerCase();
  const repos = await api.listRepos();
  const match = repos.find((r) => r.full_name.toLowerCase() === target);
  if (match) return match;
  throw new ToolError(
    'repo_not_found',
    `Repo "${clipEcho(repo)}" is not imported in DevDigest. Imported: ${capList(repos.map((r) => r.full_name))}.`,
    'Use one of the imported repos, or add the repo in the DevDigest web UI (Repositories) first.',
  );
}

/** Resolves a PR number within an already-resolved repo. */
export async function resolvePull(api: DevDigestApi, repo: ApiRepo, pr: number): Promise<ApiPull> {
  const pulls = await api.listPulls(repo.id);
  const match = pulls.find((p) => p.number === pr);
  if (match) return match;
  throw new ToolError(
    'pr_not_found',
    // The API returns pulls unordered; list the newest (highest) numbers first.
    `PR #${pr} not found in ${repo.full_name}. Known PR numbers: ${capList(
      pulls.map((p) => p.number).sort((a, b) => b - a).map(String),
    )}.`,
    'DevDigest syncs PRs from GitHub when a token is configured (Settings); check the PR number or open the repo in the web UI.',
  );
}

/** Resolves the `agent` argument (uuid → id match, otherwise case-insensitive exact name match). */
export async function resolveAgent(
  api: DevDigestApi,
  agent: string,
  opts: { requireEnabled: boolean },
): Promise<ApiAgent> {
  const trimmed = agent.trim();
  const agents = await api.listAgents();
  const matches = UUID_RE.test(trimmed)
    ? agents.filter((a) => a.id === trimmed)
    : agents.filter((a) => a.name.toLowerCase() === trimmed.toLowerCase());

  if (matches.length === 0) {
    throw new ToolError(
      'agent_not_found',
      `Agent "${clipEcho(agent)}" not found.`,
      'Call list_agents and pass one of the returned names or ids.',
    );
  }
  if (matches.length > 1) {
    throw new ToolError(
      'agent_ambiguous',
      `Agent "${clipEcho(agent)}" matches more than one agent: ${capList(matches.map((a) => `${a.name} (${a.id})`))}.`,
      'Pass the agent id instead of the name.',
    );
  }
  const match = matches[0]!;
  if (opts.requireEnabled && !match.enabled) {
    throw new ToolError(
      'agent_disabled',
      `Agent "${match.name}" is disabled.`,
      'Enable it in the web UI (Agents) or pick an enabled agent from list_agents.',
    );
  }
  return match;
}
