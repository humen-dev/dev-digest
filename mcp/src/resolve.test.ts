import { describe, expect, it } from 'vitest';
import { createFakeApi, IDS } from '../test/fake-api.js';
import { ToolError } from './errors.js';
import { parseRepoArg, resolveAgent, resolvePull, resolveRepo } from './resolve.js';

async function expectToolError(promise: Promise<unknown>): Promise<ToolError> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(ToolError);
    const toolErr = err as ToolError;
    expect(toolErr.next).toBeTruthy();
    return toolErr;
  }
  throw new Error('expected a ToolError to be thrown');
}

describe('parseRepoArg', () => {
  it('accepts owner/name, GitHub URLs and schemeless github.com paths', () => {
    expect(parseRepoArg('acme/payments-api')).toEqual({ owner: 'acme', name: 'payments-api' });
    expect(parseRepoArg('ACME/Payments-API')).toEqual({ owner: 'ACME', name: 'Payments-API' });
    expect(parseRepoArg('https://github.com/acme/payments-api.git')).toEqual({ owner: 'acme', name: 'payments-api' });
    expect(parseRepoArg('github.com/acme/payments-api/')).toEqual({ owner: 'acme', name: 'payments-api' });
  });

  it('rejects malformed repo arguments', () => {
    expect(() => parseRepoArg('acme')).toThrow(ToolError);
    expect(() => parseRepoArg('a/b/c')).toThrow(ToolError);
    try {
      parseRepoArg('acme');
      throw new Error('expected parseRepoArg to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ToolError);
      const toolErr = err as ToolError;
      expect(toolErr.code).toBe('invalid_argument');
      expect(toolErr.next).toBe('Pass repo as "owner/name".');
    }
  });
});

describe('resolveRepo', () => {
  it('resolves case-insensitively and lists imports on a miss', async () => {
    const api = createFakeApi();
    const repo = await resolveRepo(api, 'ACME/Payments-API');
    expect(repo.id).toBe(IDS.repo);

    const err = await expectToolError(resolveRepo(api, 'other/repo'));
    expect(err.code).toBe('repo_not_found');
    expect(err.message).toContain('acme/payments-api');
    expect(err.next).toContain('web UI');
  });
});

describe('resolvePull', () => {
  it('resolves a known PR and reports known numbers on a miss', async () => {
    const api = createFakeApi();
    const repo = await resolveRepo(api, 'acme/payments-api');

    const pull = await resolvePull(api, repo, 482);
    expect(pull.id).toBe(IDS.pull);

    const err = await expectToolError(resolvePull(api, repo, 999));
    expect(err.code).toBe('pr_not_found');
    expect(err.message).toContain('482');
    expect(err.next).toContain('Settings');
  });
});

describe('resolveAgent', () => {
  it('resolves by uuid and by case-insensitive name', async () => {
    const api = createFakeApi();
    const byId = await resolveAgent(api, IDS.agentGeneral, { requireEnabled: false });
    expect(byId.name).toBe('General');

    const byName = await resolveAgent(api, 'general', { requireEnabled: false });
    expect(byName.id).toBe(IDS.agentGeneral);
  });

  it('reports ambiguous matches with ids', async () => {
    const api = createFakeApi({
      agents: [
        { id: IDS.agentGeneral, name: 'Dup', description: '', provider: 'openrouter', model: 'm', enabled: true, ci_fail_on: 'critical' },
        { id: IDS.agentSecurity, name: 'Dup', description: '', provider: 'openrouter', model: 'm', enabled: true, ci_fail_on: 'critical' },
      ],
    });
    const err = await expectToolError(resolveAgent(api, 'Dup', { requireEnabled: false }));
    expect(err.code).toBe('agent_ambiguous');
    expect(err.message).toContain(IDS.agentGeneral);
    expect(err.message).toContain(IDS.agentSecurity);
    expect(err.next).toContain('id');
  });

  it('rejects disabled agents when requireEnabled is set', async () => {
    const api = createFakeApi({
      agents: [
        { id: IDS.agentGeneral, name: 'General', description: '', provider: 'openrouter', model: 'm', enabled: false, ci_fail_on: 'critical' },
      ],
    });
    const err = await expectToolError(resolveAgent(api, 'General', { requireEnabled: true }));
    expect(err.code).toBe('agent_disabled');

    // Same disabled agent is fine when the caller does not require it enabled.
    const agent = await resolveAgent(api, 'General', { requireEnabled: false });
    expect(agent.enabled).toBe(false);
  });

  it('reports unknown agents pointing at list_agents', async () => {
    const api = createFakeApi();
    const err = await expectToolError(resolveAgent(api, 'nope', { requireEnabled: false }));
    expect(err.code).toBe('agent_not_found');
    expect(err.next).toContain('list_agents');
  });
});
