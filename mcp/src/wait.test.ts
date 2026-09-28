import { describe, expect, it } from 'vitest';
import { createFakeApi, makeCtx } from '../test/fake-api.js';
import { ApiError } from './errors.js';
import { waitForRun } from './wait.js';

describe('waitForRun', () => {
  it('polls until the run reaches a terminal status and reports progress', async () => {
    const api = createFakeApi(
      { runs: { pr1: [{ run_id: 'r1', agent_id: 'a1', agent_name: 'General', status: 'running', error: null, score: null, blockers: null, findings_count: null, ran_at: null }] } },
      { runStatusScript: { r1: ['running', 'running', 'done'] } },
    );
    const ctx = makeCtx(api);

    const outcome = await waitForRun({ ctx, prId: 'pr1', runId: 'r1', label: 'test' });

    expect(outcome.kind).toBe('done');
    if (outcome.kind === 'done') expect(outcome.run.run_id).toBe('r1');
    expect(ctx.progressEvents.length).toBe(3);
  });

  it('returns failed / cancelled outcomes verbatim', async () => {
    const apiFailed = createFakeApi(
      { runs: { pr1: [{ run_id: 'r1', agent_id: 'a1', agent_name: 'General', status: 'failed', error: 'No API key', score: null, blockers: null, findings_count: null, ran_at: null }] } },
    );
    const outcomeFailed = await waitForRun({ ctx: makeCtx(apiFailed), prId: 'pr1', runId: 'r1', label: 'test' });
    expect(outcomeFailed.kind).toBe('failed');

    const apiCancelled = createFakeApi(
      { runs: { pr1: [{ run_id: 'r1', agent_id: 'a1', agent_name: 'General', status: 'cancelled', error: null, score: null, blockers: null, findings_count: null, ran_at: null }] } },
    );
    const outcomeCancelled = await waitForRun({ ctx: makeCtx(apiCancelled), prId: 'pr1', runId: 'r1', label: 'test' });
    expect(outcomeCancelled.kind).toBe('cancelled');
  });

  it('times out when the fake clock exceeds waitMs, without throwing', async () => {
    const api = createFakeApi(
      { runs: { pr1: [{ run_id: 'r1', agent_id: 'a1', agent_name: 'General', status: 'running', error: null, score: null, blockers: null, findings_count: null, ran_at: null }] } },
    );
    const ctx = makeCtx(api);

    const outcome = await waitForRun({ ctx, prId: 'pr1', runId: 'r1', label: 'test' });

    expect(outcome.kind).toBe('timeout');
    if (outcome.kind === 'timeout') expect(outcome.elapsedMs).toBeGreaterThanOrEqual(ctx.config.waitMs);
  });

  it('tolerates two consecutive listRuns errors but rethrows the third', async () => {
    let calls = 0;
    const baseApi = createFakeApi({
      runs: { pr1: [{ run_id: 'r1', agent_id: 'a1', agent_name: 'General', status: 'running', error: null, score: null, blockers: null, findings_count: null, ran_at: null }] },
    });
    const api = {
      ...baseApi,
      async listRuns() {
        calls += 1;
        throw new ApiError(500, 'boom', `transient ${calls}`);
      },
    };
    const ctx = makeCtx(api);

    await expect(waitForRun({ ctx, prId: 'pr1', runId: 'r1', label: 'test' })).rejects.toThrow(ApiError);
    expect(calls).toBe(3);
  });

  it('recovers after two transient errors when the third poll succeeds', async () => {
    let calls = 0;
    const baseApi = createFakeApi({
      runs: { pr1: [{ run_id: 'r1', agent_id: 'a1', agent_name: 'General', status: 'running', error: null, score: null, blockers: null, findings_count: null, ran_at: null }] },
    });
    const api = {
      ...baseApi,
      async listRuns() {
        calls += 1;
        if (calls <= 2) throw new ApiError(500, 'boom', 'transient');
        return [{ run_id: 'r1', agent_id: 'a1', agent_name: 'General', status: 'done', error: null, score: 80, blockers: 0, findings_count: 0, ran_at: null }];
      },
    };
    const ctx = makeCtx(api);

    const outcome = await waitForRun({ ctx, prId: 'pr1', runId: 'r1', label: 'test' });
    expect(outcome.kind).toBe('done');
  });

  it('stops on an aborted signal without calling anything cancel-like', async () => {
    const controller = new AbortController();
    controller.abort();
    const api = createFakeApi({
      runs: { pr1: [{ run_id: 'r1', agent_id: 'a1', agent_name: 'General', status: 'running', error: null, score: null, blockers: null, findings_count: null, ran_at: null }] },
    });
    const ctx = makeCtx(api, { signal: controller.signal });

    const outcome = await waitForRun({ ctx, prId: 'pr1', runId: 'r1', label: 'test' });

    expect(outcome.kind).toBe('aborted');
  });

  it('treats a run missing from the list as still running', async () => {
    const api = createFakeApi({ runs: { pr1: [] } });
    const ctx = makeCtx(api);

    const outcome = await waitForRun({ ctx, prId: 'pr1', runId: 'missing', label: 'test' });

    expect(outcome.kind).toBe('timeout');
  });
});
