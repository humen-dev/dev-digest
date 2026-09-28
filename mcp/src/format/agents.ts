// src/format/agents.ts — ring 1: pure formatter. Imports only domain/types.ts + format/*.
import type { AgentsResult, ApiAgent, CompactAgent } from '../domain/types.js';
import { clip } from './text.js';

function toCompact(agent: ApiAgent): CompactAgent {
  return {
    id: agent.id,
    name: agent.name,
    description: clip(agent.description, 120),
    model: agent.model,
    enabled: agent.enabled,
    ci_fail_on: agent.ci_fail_on,
  };
}

/** Enabled agents first, then alphabetically by name. No system_prompt, no output_schema. */
export function formatAgents(agents: ApiAgent[]): AgentsResult {
  const sorted = [...agents].sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return {
    agents: sorted.map(toCompact),
    next: 'Pass an agent name or id to run_agent_on_pr(repo, pr, agent).',
  };
}
