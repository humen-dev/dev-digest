import { describe, expect, it } from 'vitest';
import type { ApiAgent } from '../domain/types.js';
import { formatAgents } from './agents.js';

function makeAgent(over: Partial<ApiAgent> = {}): ApiAgent {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    name: 'Agent',
    description: 'A reviewer agent.',
    provider: 'openrouter',
    model: 'anthropic/claude-sonnet-5',
    enabled: true,
    ci_fail_on: 'critical',
    ...over,
  };
}

describe('formatAgents', () => {
  it('sorts enabled agents first then alphabetically, strips system_prompt, and stays compact', () => {
    const agents: ApiAgent[] = [
      makeAgent({ id: '1', name: 'Zeta', enabled: false }),
      makeAgent({ id: '2', name: 'Beta', enabled: true }),
      makeAgent({ id: '3', name: 'Alpha', enabled: true }),
      makeAgent({ id: '4', name: 'Gamma', enabled: false }),
    ];

    const result = formatAgents(agents);

    expect(result.agents.map((a) => a.name)).toEqual(['Alpha', 'Beta', 'Gamma', 'Zeta']);
    expect(result.next).toContain('run_agent_on_pr');
    for (const a of result.agents) {
      expect(a).not.toHaveProperty('system_prompt');
      expect(a.description.length).toBeLessThanOrEqual(120);
    }
  });

  it('serialises 50 agents to at most 8000 chars', () => {
    const agents = Array.from({ length: 50 }, (_, i) =>
      makeAgent({
        id: `agent-${i}`,
        name: `Agent ${i}`,
        description: 'General-purpose reviewer.',
      }));

    const result = formatAgents(agents);

    expect(JSON.stringify(result).length).toBeLessThanOrEqual(8000);
  });
});
