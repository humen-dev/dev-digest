// src/tools/list-agents.ts — ring 2: use case. Depends only on the DevDigestApi port + format/*.
import { ToolError } from '../errors.js';
import { formatAgents } from '../format/agents.js';
import type { ToolHandler } from './types.js';

/** Lists DevDigest reviewer agents, enabled first. Never throws for an empty result if agents exist. */
export const listAgents: ToolHandler<'list_agents'> = async (_args, ctx) => {
  const agents = await ctx.api.listAgents();
  if (agents.length === 0) {
    throw new ToolError(
      'agent_not_found',
      'No reviewer agents are configured in DevDigest.',
      'Create an agent in the DevDigest web UI (Agents).',
    );
  }
  return formatAgents(agents);
};
