import { describe, expect, it } from 'vitest';
import { createFakeApi, IDS, makeCtx } from '../../test/fake-api.js';
import { getFindings } from './get-findings.js';
import type { ApiReview, ApiRun, ReviewResult, RunningResult } from '../domain/types.js';

const RUN_ID = '55555555-5555-4555-8555-555555555555';

function baseRun(over: Partial<ApiRun> = {}): ApiRun {
  return {
    run_id: RUN_ID,
    agent_id: IDS.agentGeneral,
    agent_name: 'General',
    status: 'done',
    error: null,
    score: 80,
    blockers: 0,
    findings_count: 0,
    ran_at: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function summaryReview(over: Partial<ApiReview> = {}): ApiReview {
  return {
    id: 'review-summary',
    run_id: RUN_ID,
    agent_id: IDS.agentGeneral,
    agent_name: 'General',
    kind: 'summary',
    verdict: null,
    summary: 'summary kind, must be ignored',
    score: null,
    created_at: '2026-01-01T00:00:00.000Z',
    findings: [],
    ...over,
  };
}

function reviewOf(over: Partial<ApiReview> = {}): ApiReview {
  return {
    id: 'review-1',
    run_id: RUN_ID,
    agent_id: IDS.agentGeneral,
    agent_name: 'General',
    kind: 'review',
    verdict: 'comment',
    summary: 'Looks fine overall.',
    score: 80,
    created_at: '2026-01-01T00:00:00.000Z',
    findings: [],
    ...over,
  };
}

describe('getFindings', () => {
  it('picks the newest kind:review review, ignoring kind:summary', async () => {
    const api = createFakeApi({
      runs: { [IDS.pull]: [baseRun()] },
      // The summary review is listed first and is newer, so only the kind filter
      // can make the kind:review row win.
      reviews: { [IDS.pull]: [summaryReview({ created_at: '2026-01-02T00:00:00.000Z' }), reviewOf()] },
    });
    const ctx = makeCtx(api);

    const result = (await getFindings({ repo: 'acme/payments-api', pr: 482 }, ctx)) as ReviewResult;

    expect(result.status).toBe('done');
    expect(result.run_id).toBe(RUN_ID);
    expect(result.verdict).toBe('comment');
    expect(result.summary).toBe('Looks fine overall.');
    expect(api.calls.some((c) => c.method === 'startReview')).toBe(false);
    expect(api.calls.some((c) => c.method === 'warmPull')).toBe(false);
  });

  it('filters by agent when given', async () => {
    const otherRunId = '66666666-6666-4666-8666-666666666666';
    const api = createFakeApi({
      runs: { [IDS.pull]: [baseRun(), baseRun({ run_id: otherRunId, agent_id: IDS.agentSecurity, agent_name: 'Security' })] },
      reviews: {
        // The General review is listed first and is newer, so only the agent
        // filter can make the Security review win.
        [IDS.pull]: [
          reviewOf({ id: 'r-general', created_at: '2026-01-02T00:00:00.000Z' }),
          reviewOf({ id: 'r-security', run_id: otherRunId, agent_id: IDS.agentSecurity, agent_name: 'Security' }),
        ],
      },
    });
    const ctx = makeCtx(api);

    const result = (await getFindings({ repo: 'acme/payments-api', pr: 482, agent: 'Security' }, ctx)) as ReviewResult;

    expect(result.agent).toBe('Security');
    expect(result.run_id).toBe(otherRunId);
  });

  it('rejects a run_id that belongs to a different agent than the one passed', async () => {
    const api = createFakeApi({ runs: { [IDS.pull]: [baseRun()] }, reviews: { [IDS.pull]: [reviewOf()] } });
    const ctx = makeCtx(api);

    await expect(
      getFindings({ repo: 'acme/payments-api', pr: 482, run_id: RUN_ID, agent: 'Security' }, ctx),
    ).rejects.toMatchObject({ code: 'invalid_argument', next: expect.stringContaining('run_id') });
  });

  it('with run_id: running -> RunningResult, unknown -> run_not_found, failed -> run_failed', async () => {
    const api = createFakeApi({ runs: { [IDS.pull]: [baseRun({ status: 'running' })] } });
    const ctx = makeCtx(api);

    const running = (await getFindings({ repo: 'acme/payments-api', pr: 482, run_id: RUN_ID }, ctx)) as RunningResult;
    expect(running.status).toBe('running');

    await expect(
      getFindings({ repo: 'acme/payments-api', pr: 482, run_id: '77777777-7777-4777-8777-777777777777' }, ctx),
    ).rejects.toMatchObject({ code: 'run_not_found' });

    const failedApi = createFakeApi({ runs: { [IDS.pull]: [baseRun({ status: 'failed', error: 'No API key' })] } });
    const failedCtx = makeCtx(failedApi);
    await expect(
      getFindings({ repo: 'acme/payments-api', pr: 482, run_id: RUN_ID }, failedCtx),
    ).rejects.toMatchObject({ code: 'run_failed', message: expect.stringContaining('No API key') });
  });

  it('no reviews and no active run -> no_review; no reviews but an active run -> RunningResult', async () => {
    const api = createFakeApi();
    const ctx = makeCtx(api);
    await expect(getFindings({ repo: 'acme/payments-api', pr: 482 }, ctx)).rejects.toMatchObject({
      code: 'no_review',
      next: expect.stringContaining('run_agent_on_pr'),
    });

    const activeApi = createFakeApi({
      active: { [IDS.pull]: [{ run_id: RUN_ID, agent_id: IDS.agentGeneral, agent_name: 'General' }] },
    });
    const activeCtx = makeCtx(activeApi);
    const result = (await getFindings({ repo: 'acme/payments-api', pr: 482 }, activeCtx)) as RunningResult;
    expect(result.status).toBe('running');
  });
});
