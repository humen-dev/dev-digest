import { describe, expect, it } from 'vitest';
import { createFakeApi, makeCtx } from '../../test/fake-api.js';
import { listAgents } from './list-agents.js';
import type { AgentsResult } from '../domain/types.js';

describe('listAgents', () => {
  it('returns enabled agents first with no system_prompt and points to run_agent_on_pr', async () => {
    const api = createFakeApi();
    const ctx = makeCtx(api);

    const result = (await listAgents({}, ctx)) as AgentsResult;

    expect(result.agents.map((a) => a.name)).toEqual(['General', 'Security']);
    for (const agent of result.agents) {
      expect(agent).not.toHaveProperty('system_prompt');
    }
    expect(result.next).toContain('run_agent_on_pr');
  });

  it('throws agent_not_found pointing to the web UI when there are no agents', async () => {
    const api = createFakeApi({ agents: [] });
    const ctx = makeCtx(api);

    await expect(listAgents({}, ctx)).rejects.toMatchObject({
      code: 'agent_not_found',
      next: expect.stringContaining('web UI'),
    });
  });
});
