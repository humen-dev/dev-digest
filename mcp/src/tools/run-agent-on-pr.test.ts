import { describe, expect, it } from 'vitest';
import { createFakeApi, IDS, makeCtx } from '../../test/fake-api.js';
import type { FakeApi } from '../../test/fake-api.js';
import { ApiError, ToolError } from '../errors.js';
import { runAgentOnPr } from './run-agent-on-pr.js';
import type { ReviewResult, RunningResult } from '../domain/types.js';

const REPO = 'acme/payments-api';
const PR = 482;
const RUN_ID = 'fixed-run-id';

/** Rewires startReview to hand out a fixed run id, so runStatusScript can target it deterministically. */
function withFixedStartReview(api: FakeApi, runId: string): FakeApi {
  api.startReview = async (prId, agentId) => {
    const agent = api.data.agents.find((a) => a.id === agentId)!;
    (api.data.runs[prId] ??= []).unshift({
      run_id: runId, agent_id: agentId, agent_name: agent.name, status: 'running', error: null,
      score: null, blockers: null, findings_count: null, ran_at: null,
    });
    (api.data.active[prId] ??= []).unshift({ run_id: runId, agent_id: agentId, agent_name: agent.name });
    api.calls.push({ method: 'startReview', args: [prId, agentId] });
    return { run_id: runId, agent_id: agentId, agent_name: agent.name };
  };
  return api;
}

function baseArgs(overrides: Partial<{ agent: string }> = {}) {
  return { repo: REPO, pr: PR, agent: overrides.agent ?? 'General', min_severity: undefined, limit: undefined };
}

describe('runAgentOnPr', () => {
  it('resolves, warms, starts, polls to done and returns a ReviewResult in the expected call order', async () => {
    const api = withFixedStartReview(createFakeApi(undefined, { runStatusScript: { [RUN_ID]: ['running', 'running', 'done'] } }), RUN_ID);
    api.data.reviews[IDS.pull] = [
      { id: 'review-1', run_id: RUN_ID, agent_id: IDS.agentGeneral, agent_name: 'General', kind: 'review', verdict: 'approve', summary: 'Looks fine.', score: 90, created_at: new Date(0).toISOString(), findings: [] },
    ];
    const ctx = makeCtx(api);

    const result = (await runAgentOnPr(baseArgs(), ctx)) as ReviewResult;

    expect(result.status).toBe('done');
    expect(result.run_id).toBe(RUN_ID);
    expect(result.verdict).toBe('approve');
    expect(result.gate).toBeNull(); // the fake run never sets `blockers`, matching Decision 8's null case

    const methods = api.calls.map((c) => c.method);
    expect(methods).toEqual([
      'listRepos', 'listPulls', 'listAgents', 'listActiveRuns', 'warmPull', 'startReview',
      'listRuns', 'listRuns', 'listRuns', 'listReviews',
    ]);
  });

  it('emits a progress event per poll', async () => {
    const api = withFixedStartReview(createFakeApi(undefined, { runStatusScript: { [RUN_ID]: ['running', 'done'] } }), RUN_ID);
    api.data.reviews[IDS.pull] = [
      { id: 'review-1', run_id: RUN_ID, agent_id: IDS.agentGeneral, agent_name: 'General', kind: 'review', verdict: 'approve', summary: 'ok', score: 100, created_at: new Date(0).toISOString(), findings: [] },
    ];
    const ctx = makeCtx(api);

    await runAgentOnPr(baseArgs(), ctx);

    expect(ctx.progressEvents.length).toBe(2);
  });

  it('attaches to an active run for the same agent instead of starting a new one', async () => {
    const api = createFakeApi();
    api.data.active[IDS.pull] = [{ run_id: RUN_ID, agent_id: IDS.agentGeneral, agent_name: 'General' }];
    api.data.runs[IDS.pull] = [{ run_id: RUN_ID, agent_id: IDS.agentGeneral, agent_name: 'General', status: 'done', error: null, score: 70, blockers: 1, findings_count: 1, ran_at: null }];
    api.data.reviews[IDS.pull] = [
      { id: 'review-1', run_id: RUN_ID, agent_id: IDS.agentGeneral, agent_name: 'General', kind: 'review', verdict: 'request_changes', summary: 'issues', score: 70, created_at: new Date(0).toISOString(), findings: [] },
    ];
    const ctx = makeCtx(api);

    const result = (await runAgentOnPr(baseArgs(), ctx)) as ReviewResult;

    expect(result.attached).toBe(true);
    expect(result.run_id).toBe(RUN_ID);
    expect(api.calls.some((c) => c.method === 'startReview')).toBe(false);
  });

  it('still starts the review when warmPull throws', async () => {
    const api = withFixedStartReview(
      createFakeApi(undefined, { failOn: { warmPull: new ApiError(500, 'boom', 'warm failed') } }),
      RUN_ID,
    );
    const ctx = makeCtx(api);

    const result = (await runAgentOnPr(baseArgs(), ctx)) as RunningResult;

    expect(result.status).toBe('running');
    expect(api.calls.some((c) => c.method === 'startReview')).toBe(true);
  });

  it('maps a failed run to run_failed with a Settings hint', async () => {
    const api = withFixedStartReview(createFakeApi(undefined, { runStatusScript: { [RUN_ID]: ['failed'] } }), RUN_ID);
    const ctx = makeCtx(api);

    await expect(runAgentOnPr(baseArgs(), ctx)).rejects.toMatchObject({
      code: 'run_failed',
      next: expect.stringContaining('Settings'),
    });
  });

  it('maps a cancelled run to run_cancelled', async () => {
    const api = withFixedStartReview(createFakeApi(undefined, { runStatusScript: { [RUN_ID]: ['cancelled'] } }), RUN_ID);
    const ctx = makeCtx(api);

    await expect(runAgentOnPr(baseArgs(), ctx)).rejects.toMatchObject({ code: 'run_cancelled' });
  });

  it('returns a RunningResult (not an error) once the wait budget is exhausted', async () => {
    const api = withFixedStartReview(createFakeApi(), RUN_ID);
    const ctx = makeCtx(api);

    const result = (await runAgentOnPr(baseArgs(), ctx)) as RunningResult;

    expect(result.status).toBe('running');
    expect(result.next).toContain('get_findings');
    expect(result.next).toContain(result.run_id);
  });

  it('two transient listRuns errors are tolerated during the wait', async () => {
    const api = withFixedStartReview(createFakeApi(), RUN_ID);
    api.data.reviews[IDS.pull] = [
      { id: 'review-1', run_id: RUN_ID, agent_id: IDS.agentGeneral, agent_name: 'General', kind: 'review', verdict: 'approve', summary: 'ok', score: 100, created_at: new Date(0).toISOString(), findings: [] },
    ];
    let listRunsCalls = 0;
    const originalListRuns = api.listRuns.bind(api);
    api.listRuns = async (prId) => {
      listRunsCalls += 1;
      if (listRunsCalls <= 2) throw new ApiError(500, 'boom', 'transient');
      api.data.runs[prId]![0]!.status = 'done';
      return originalListRuns(prId);
    };
    const ctx = makeCtx(api);

    const result = (await runAgentOnPr(baseArgs(), ctx)) as ReviewResult;

    expect(result.status).toBe('done');
  });

  it('an aborted signal stops polling and never calls anything cancel-like', async () => {
    const controller = new AbortController();
    controller.abort();
    const api = withFixedStartReview(createFakeApi(), RUN_ID);
    const ctx = makeCtx(api, { signal: controller.signal });

    const result = (await runAgentOnPr(baseArgs(), ctx)) as RunningResult;

    // Aborted before the first poll: the run keeps going server-side and the
    // agent is pointed at get_findings.
    expect(result.status).toBe('running');
    expect(result.run_id).toBe(RUN_ID);
    expect(result.next).toContain('get_findings');
    expect(api.calls.filter((c) => c.method === 'listRuns')).toHaveLength(0);
    expect(api.calls.map((c) => c.method)).toEqual([
      'listRepos', 'listPulls', 'listAgents', 'listActiveRuns', 'warmPull', 'startReview',
    ]);
  });

  it('propagates a 429 from startReview as-is', async () => {
    const api = createFakeApi(undefined, { failOn: { startReview: new ApiError(429, 'rate_limited', 'too many') } });
    const ctx = makeCtx(api);

    await expect(runAgentOnPr(baseArgs(), ctx)).rejects.toMatchObject({
      name: 'ApiError',
      status: 429,
      apiCode: 'rate_limited',
    });
  });

  it('rejects a disabled agent before any startReview call', async () => {
    const api = createFakeApi({
      agents: [{ id: 'disabled-1', name: 'Disabled', description: '', provider: 'openrouter', model: 'x', enabled: false, ci_fail_on: 'critical' }],
    });
    const ctx = makeCtx(api);

    await expect(runAgentOnPr(baseArgs({ agent: 'Disabled' }), ctx)).rejects.toMatchObject(
      { code: 'agent_disabled' } satisfies Partial<ToolError>,
    );
    expect(api.calls.some((c) => c.method === 'startReview')).toBe(false);
  });
});
