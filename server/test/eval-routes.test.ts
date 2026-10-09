import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { EvalCase, EvalRunDetail, EvalRunStarted } from '@devdigest/shared';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { MockAuthProvider } from '../src/adapters/mocks.js';
import {
  FIXTURE_DIFF,
  FakeEvalRepo,
  REVIEW_ON_A2,
  WS,
  findingSource,
  snapshotOf,
  stubLlm,
  uuid,
} from './helpers/eval-fakes.js';

/** DB-free route tests; `auth` MUST be mocked too (server INSIGHTS 2026-09-21). */
const test = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const AGENT = uuid();

function setup() {
  const repo = new FakeEvalRepo();
  repo.seedAgent(WS, snapshotOf(AGENT));
  const llm = stubLlm(() => REVIEW_ON_A2);
  return { repo, llm };
}

const manualBody = {
  name: 'manual',
  input_diff: FIXTURE_DIFF,
  pr_title: 'T',
  pr_body: null,
  expectation: { type: 'must_find', file: 'a.ts', start_line: 2, end_line: 2 },
};

describe('eval routes (no DB)', () => {
  let app: FastifyInstance;
  const { repo, llm } = setup();

  beforeAll(async () => {
    app = await buildApp({
      config: test,
      overrides: { auth: new MockAuthProvider(), evalRepo: repo, llm: { openai: llm } },
    });
  });
  afterAll(async () => {
    await app.close();
  });

  it('manual create → 201, patch → 200, invalid type → 422 with the row unchanged, delete → 204', async () => {
    const created = await app.inject({ method: 'POST', url: `/agents/${AGENT}/eval-cases`, payload: manualBody });
    expect(created.statusCode).toBe(201);
    const c = EvalCase.parse(created.json());
    expect(c.source_finding_id).toBeNull();

    const ok = await app.inject({
      method: 'PATCH',
      url: `/eval-cases/${c.id}`,
      payload: { expectation: { ...manualBody.expectation, type: 'must_not_flag' } },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().expectation.type).toBe('must_not_flag');

    const bad = await app.inject({
      method: 'PATCH',
      url: `/eval-cases/${c.id}`,
      payload: { expectation: { ...manualBody.expectation, type: 'maybe' } },
    });
    expect(bad.statusCode).toBe(422);
    expect(JSON.stringify(bad.json().error.details)).toContain('expectation');
    expect((await repo.getCase(WS, c.id))!.expectation.type).toBe('must_not_flag');

    const detail = await app.inject({ method: 'GET', url: `/eval-cases/${c.id}` });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({ source: null, source_deleted: false, last_outcome: null });

    expect((await app.inject({ method: 'DELETE', url: `/eval-cases/${c.id}` })).statusCode).toBe(204);
    expect((await app.inject({ method: 'DELETE', url: `/eval-cases/${c.id}` })).statusCode).toBe(404);
  });

  it('an out-of-hunk manual expectation → 422 expectation_outside_diff with file and range', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${AGENT}/eval-cases`,
      payload: { ...manualBody, expectation: { ...manualBody.expectation, start_line: 70, end_line: 71 } },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toMatchObject({
      code: 'expectation_outside_diff',
      details: { file: 'a.ts', start_line: 70, end_line: 71 },
    });
  });

  it('finding → eval case: 404 unknown, 422 untriaged', async () => {
    expect((await app.inject({ method: 'POST', url: `/findings/${uuid()}/eval-case` })).statusCode).toBe(404);
    const f = findingSource({ agent_id: AGENT, accepted_at: null, dismissed_at: null });
    repo.seedFinding(WS, f);
    const res = await app.inject({ method: 'POST', url: `/findings/${f.finding_id}/eval-case` });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('finding_not_triaged');
  });

  it('run lifecycle: 202 → poll → completed; a second start while running is 409; read routes work', async () => {
    const agent = uuid();
    repo.seedAgent(WS, snapshotOf(agent));
    repo.seedCase(WS, agent);

    const none = await app.inject({ method: 'POST', url: `/agents/${uuid()}/eval-runs` });
    expect(none.statusCode).toBe(404);

    const est = await app.inject({ method: 'GET', url: `/agents/${agent}/eval-runs/estimate` });
    expect(est.json()).toEqual({ agent_id: agent, cases_total: 1 });

    const started = await app.inject({ method: 'POST', url: `/agents/${agent}/eval-runs` });
    expect(started.statusCode).toBe(202);
    const { run_id } = EvalRunStarted.parse(started.json());
    await app.container.evalService.idle();

    const run = EvalRunDetail.parse((await app.inject({ method: 'GET', url: `/eval-runs/${run_id}` })).json());
    expect(run.status).toBe('completed');

    repo.seedRunningRun(WS, agent);
    const again = await app.inject({ method: 'POST', url: `/agents/${agent}/eval-runs` });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('run_in_flight');

    const list = await app.inject({ method: 'GET', url: `/agents/${agent}/eval-runs` });
    expect(list.statusCode).toBe(200);
    expect(list.json().length).toBe(2);
    expect((await app.inject({ method: 'GET', url: `/agents/${agent}/eval-cases` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/eval/dashboard' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/eval/agents/${agent}` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/eval/agents/${uuid()}` })).statusCode).toBe(404);
  });

  it('compare: the same id twice → 422, missing run → 404, malformed query → 422', async () => {
    const id = uuid();
    const same = await app.inject({ method: 'GET', url: `/eval-runs/compare?a=${id}&b=${id}` });
    expect(same.statusCode).toBe(422);
    expect(same.json().error.code).toBe('invalid_compare_pair');
    expect((await app.inject({ method: 'GET', url: `/eval-runs/compare?a=${id}&b=${uuid()}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/eval-runs/compare?a=x&b=y' })).statusCode).toBe(422);
  });

  it('run-all reports per agent', async () => {
    const res = await app.inject({ method: 'POST', url: '/eval-runs/all' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().results)).toBe(true);
    await app.container.evalService.idle();
  });
});

describe('eval routes — run-start rate limit', () => {
  it('the 6th start request within a minute is 429', async () => {
    const { repo: r, llm } = setup();
    r.seedCase(WS, AGENT);
    const dev = loadConfig({ ...process.env, NODE_ENV: 'development' } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config: dev,
      overrides: { auth: new MockAuthProvider(), evalRepo: r, llm: { openai: llm } },
    });
    try {
      const codes: number[] = [];
      for (let i = 0; i < 6; i++) {
        // refused starts (409 while the first run is in flight) count against the limit too
        codes.push((await app.inject({ method: 'POST', url: `/agents/${AGENT}/eval-runs` })).statusCode);
      }
      expect(codes.slice(0, 5).every((c) => c !== 429)).toBe(true);
      expect(codes[5]).toBe(429);
      await app.container.evalService.idle();
    } finally {
      await app.close();
    }
  });
});
