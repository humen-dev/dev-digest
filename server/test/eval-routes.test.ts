import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { EvalCase, EvalCaseDraftResponse, EvalRunDetail, EvalRunStarted } from '@devdigest/shared';
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

  it('finding draft + save: 404 unknown, 422 untriaged, draft → 200 with no row, save → 201 then 200, 409 on a changed decision', async () => {
    expect((await app.inject({ method: 'GET', url: `/findings/${uuid()}/eval-case-draft` })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'POST', url: `/findings/${uuid()}/eval-case`, payload: manualBody })).statusCode,
    ).toBe(404);

    const untriaged = findingSource({ agent_id: AGENT, accepted_at: null, dismissed_at: null });
    repo.seedFinding(WS, untriaged);
    const un = await app.inject({ method: 'GET', url: `/findings/${untriaged.finding_id}/eval-case-draft` });
    expect([un.statusCode, un.json().error.code]).toEqual([422, 'finding_not_triaged']);
    const unSave = await app.inject({ method: 'POST', url: `/findings/${untriaged.finding_id}/eval-case`, payload: manualBody });
    expect([unSave.statusCode, unSave.json().error.code]).toEqual([422, 'finding_not_triaged']);

    // The route-level app has no PR diff source (that needs the DB — see eval-case-draft.it.test.ts),
    // so a draft that must read the diff is 422 here, with nothing written.
    const f = findingSource({ agent_id: AGENT });
    repo.seedFinding(WS, f);
    const before = (await repo.listCases(WS, AGENT)).length;
    const noDiff = await app.inject({ method: 'GET', url: `/findings/${f.finding_id}/eval-case-draft` });
    expect([noDiff.statusCode, noDiff.json().error.code]).toEqual([422, 'diff_unavailable']);
    expect((await repo.listCases(WS, AGENT)).length).toBe(before);

    const payload = manualBody;
    const saved = await app.inject({ method: 'POST', url: `/findings/${f.finding_id}/eval-case`, payload });
    expect(saved.statusCode, saved.body).toBe(201);
    const again = await app.inject({ method: 'POST', url: `/findings/${f.finding_id}/eval-case`, payload });
    expect(again.statusCode).toBe(200);
    expect(again.json().id).toBe(saved.json().id);
    const existing = EvalCaseDraftResponse.parse(
      (await app.inject({ method: 'GET', url: `/findings/${f.finding_id}/eval-case-draft` })).json(),
    );
    expect(existing).toEqual({ kind: 'existing_case', case_id: saved.json().id, owner_id: AGENT });

    const g = findingSource({ agent_id: AGENT, dismissed_at: '2099-01-01T00:00:00.000Z' });
    repo.seedFinding(WS, g);
    const conflict = await app.inject({ method: 'POST', url: `/findings/${g.finding_id}/eval-case`, payload });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error).toMatchObject({
      code: 'decision_changed',
      details: { current_type: 'must_not_flag', submitted_type: 'must_find' },
    });
  });

  it('save rejects an unknown body key and a bad expectation with the field path (422)', async () => {
    const f = findingSource({ agent_id: AGENT });
    repo.seedFinding(WS, f);
    const url = `/findings/${f.finding_id}/eval-case`;
    const extra = await app.inject({ method: 'POST', url, payload: { ...manualBody, owner_id: 'x' } });
    expect(extra.statusCode).toBe(422);
    const bad = await app.inject({ method: 'POST', url, payload: { ...manualBody, expectation: { ...manualBody.expectation, type: 'maybe' } } });
    expect(bad.statusCode).toBe(422);
    expect(JSON.stringify(bad.json().error.details)).toContain('expectation');
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

describe('eval routes — disabled agent', () => {
  it('AC-34: a disabled agent still accepts a run → 202', async () => {
    const { repo: r, llm } = setup();
    const disabled = uuid();
    // The snapshot port deliberately carries no enabled gate; the flag is set to prove it is not consulted.
    r.seedAgent(WS, { ...snapshotOf(disabled), enabled: false } as ReturnType<typeof snapshotOf>);
    r.seedCase(WS, disabled);
    const app = await buildApp({
      config: test,
      overrides: { auth: new MockAuthProvider(), evalRepo: r, llm: { openai: llm } },
    });
    try {
      const res = await app.inject({ method: 'POST', url: `/agents/${disabled}/eval-runs` });
      expect(res.statusCode).toBe(202);
      await app.container.evalService.idle();
    } finally {
      await app.close();
    }
  });
});

describe('eval routes — run-start rate limit', () => {
  it('POST /eval-runs/all: the 6th call within a minute is 429 (its own bucket)', async () => {
    const { repo: r, llm } = setup();
    const dev = loadConfig({ ...process.env, NODE_ENV: 'development' } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config: dev,
      overrides: { auth: new MockAuthProvider(), evalRepo: r, llm: { openai: llm } },
    });
    try {
      const codes: number[] = [];
      for (let i = 0; i < 6; i++) codes.push((await app.inject({ method: 'POST', url: '/eval-runs/all' })).statusCode);
      expect(codes.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
      expect(codes[5]).toBe(429);
    } finally {
      await app.close();
    }
  });

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
