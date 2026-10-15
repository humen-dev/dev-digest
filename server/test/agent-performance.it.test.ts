/**
 * SPEC-09 Agent Performance over a real Postgres (Testcontainers): `GET /agents/performance`
 * and `GET /agents/:id/stats` through `buildApp`, real repository, own fixtures per test.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { AgentPerf, AgentPerfRow, AgentStats } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig, type AppConfig } from '../src/platform/config.js';
import { MockAuthProvider, MockLLMProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[agent-performance] Docker not available — skipping integration tests.');
}

const FROM = '2026-06-10T00:00:00.000Z';
const TO = '2026-06-20T00:00:00.000Z';
const FROM_MS = Date.parse(FROM);
const TO_MS = Date.parse(TO);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const q = (from = FROM, to = TO) => `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

d('Agent performance (Testcontainers pg)', () => {
  let pg: PgFixture;
  const apps: FastifyInstance[] = [];
  const llm = new MockLLMProvider('openai');

  beforeAll(async () => {
    pg = await startPg();
  });
  afterAll(async () => {
    for (const a of apps) await a.close();
    await pg?.stop();
  });

  // ---- fixtures: every test builds its own workspace ----
  async function fresh() {
    const db = pg.handle.db;
    const [w] = await db.insert(t.workspaces).values({ name: `perf-${randomUUID()}` }).returning();
    const ws = w!.id;
    const [r] = await db.insert(t.repos).values({ workspaceId: ws, owner: 'a', name: 'b', fullName: `a/${ws}` }).returning();
    const [p] = await db
      .insert(t.pullRequests)
      .values({ workspaceId: ws, repoId: r!.id, number: 1, title: 'pr', author: 'x', branch: 'f', base: 'main', headSha: 's' })
      .returning();
    const base = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config: { ...base, logLevel: 'silent' } as AppConfig,
      db,
      overrides: { auth: new MockAuthProvider(undefined, { id: ws, name: 'ws' }), llm: { openai: llm } },
    });
    apps.push(app);

    const agent = async (name: string, enabled = true) => {
      const [a] = await db
        .insert(t.agents)
        .values({ workspaceId: ws, name, provider: 'openai', model: 'm', systemPrompt: 'x', enabled })
        .returning();
      return a!.id;
    };
    const run = async (
      agentId: string | null,
      at: number,
      over: Partial<typeof t.agentRuns.$inferInsert> = {},
    ) => {
      const [x] = await db
        .insert(t.agentRuns)
        .values({ workspaceId: ws, agentId, ranAt: new Date(at), status: 'done', model: 'gpt', durationMs: 1000, costUsd: 0.1, ...over })
        .returning();
      return x!.id;
    };
    /** Review for a run with findings of the given decision states. */
    const decide = async (
      runId: string | null,
      states: ('accepted' | 'dismissed' | 'pending' | 'both')[],
      workspaceId = ws,
    ) => {
      const [rv] = await db
        .insert(t.reviews)
        .values({ workspaceId, prId: p!.id, runId, kind: 'review' })
        .returning();
      for (const s of states) {
        await db.insert(t.findings).values({
          reviewId: rv!.id,
          file: 'f.ts',
          startLine: 1,
          endLine: 1,
          severity: 'warning',
          category: 'bug',
          title: 't',
          rationale: 'r',
          confidence: 0.9,
          acceptedAt: s === 'accepted' || s === 'both' ? new Date() : null,
          dismissedAt: s === 'dismissed' || s === 'both' ? new Date() : null,
        });
      }
      return rv!.id;
    };
    const perf = async (query = q()) => {
      const res = await app.inject({ method: 'GET', url: `/agents/performance?${query}` });
      return { res, body: res.json() as AgentPerf };
    };
    const stats = async (id: string, query = q()) => {
      const res = await app.inject({ method: 'GET', url: `/agents/${id}/stats?${query}` });
      return { res, body: res.json() as AgentStats };
    };
    const row = (body: AgentPerf, id: string | null) => body.agents.find((a) => a.agent_id === id)!;
    return { ws, app, agent, run, decide, perf, stats, row };
  }

  it('counts the closed period [from, to] (AC-13, EC-2)', async () => {
    const f = await fresh();
    const a = await f.agent('A');
    await f.run(a, FROM_MS);
    await f.run(a, TO_MS);
    await f.run(a, FROM_MS - 1);
    await f.run(a, TO_MS + 1);
    const { body } = await f.perf();
    expect(f.row(body, a).runs).toBe(2);
    expect(body.summary.runs).toBe(2);
  });

  it('defaults to the last 720 h (AC-14)', async () => {
    const f = await fresh();
    const a = await f.agent('A');
    const now = Date.now();
    await f.run(a, now - 721 * HOUR);
    await f.run(a, now - 719 * HOUR);
    const res = await f.app.inject({ method: 'GET', url: '/agents/performance' });
    expect(res.statusCode).toBe(200);
    expect((res.json() as AgentPerf).summary.runs).toBe(1);
  });

  it('serves /agents/:id/stats and 404s unknown or foreign agents (AC-15, EC-14)', async () => {
    const f = await fresh();
    const other = await fresh();
    const a = await f.agent('A');
    const foreign = await other.agent('Foreign');
    await f.run(a, FROM_MS + DAY);
    await f.run(a, FROM_MS + 2 * DAY);
    await f.run(a, FROM_MS - 2 * DAY); // previous period only
    const cur = await f.stats(a);
    expect(cur.res.statusCode).toBe(200);
    expect(cur.body.runs).toBe(2);
    const prevQ = q(new Date(FROM_MS - 10 * DAY).toISOString(), FROM);
    expect((await f.stats(a, prevQ)).body.runs).toBe(1);
    for (const id of [randomUUID(), foreign]) {
      const res = await f.app.inject({ method: 'GET', url: `/agents/${id}/stats?${q()}` });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('not_found');
    }
  });

  it('lists idle and disabled agents, and a deleted agent as Unknown agent (AC-16, AC-17, EC-3)', async () => {
    const f = await fresh();
    const idle = await f.agent('Idle', false);
    const gone = await f.agent('Gone');
    const runId = await f.run(gone, FROM_MS + DAY);
    await f.decide(runId, ['accepted', 'dismissed', 'pending']);
    await pg.handle.db.delete(t.agents).where(eq(t.agents.id, gone)); // agent_runs.agent_id -> null
    const { body } = await f.perf();
    const r = f.row(body, idle);
    expect(r.runs).toBe(0);
    expect(r.enabled).toBe(false);
    const unknown = f.row(body, null);
    expect(unknown.agent_name).toBe('Unknown agent');
    expect(unknown.enabled).toBeNull();
    expect(unknown.runs).toBe(1);
    expect([unknown.accepted, unknown.dismissed, unknown.pending]).toEqual([1, 1, 1]);
    expect(body.agents.filter((x) => x.agent_id === null)).toHaveLength(1);
  });

  it('derives accepted / dismissed / pending / decided (AC-21, EC-9)', async () => {
    const f = await fresh();
    const a = await f.agent('A');
    const r1 = await f.run(a, FROM_MS + DAY);
    const r2 = await f.run(a, FROM_MS + 2 * DAY);
    await f.decide(r1, ['accepted', 'accepted', 'dismissed', 'pending']);
    await f.decide(r2, ['dismissed', 'pending', 'both']); // accepted wins when both stamps exist
    const row = f.row((await f.perf()).body, a);
    expect(row.accepted).toBe(3);
    expect(row.dismissed).toBe(2);
    expect(row.pending).toBe(2);
    expect(row.decided).toBe(5);
    expect(row.accept_rate).toBeCloseTo(3 / 5);
  });

  it('counts a finding accepted then dismissed through the real write path as dismissed (AC-21, EC-9)', async () => {
    const f = await fresh();
    const a = await f.agent('A');
    const runId = await f.run(a, FROM_MS + DAY);
    const reviewId = await f.decide(runId, ['pending', 'pending']);
    const [target] = await pg.handle.db.select().from(t.findings).where(eq(t.findings.reviewId, reviewId));
    const act = async (action: 'accept' | 'dismiss') => {
      const res = await f.app.inject({ method: 'POST', url: `/findings/${target!.id}/${action}` });
      expect(res.statusCode).toBe(200);
    };
    const snap = async () => {
      const row = f.row((await f.perf()).body, a);
      const s = (await f.stats(a)).body;
      expect([s.accepted, s.dismissed, s.pending, s.decided]).toEqual([row.accepted, row.dismissed, row.pending, row.decided]);
      return row;
    };

    await act('accept');
    const accepted = await snap();
    expect([accepted.accepted, accepted.dismissed, accepted.decided]).toEqual([1, 0, 1]);

    await act('dismiss');
    const dismissed = await snap();
    expect(dismissed.accepted).toBe(accepted.accepted - 1);
    expect(dismissed.dismissed).toBe(accepted.dismissed + 1);
    expect(dismissed.decided).toBe(accepted.decided);
    expect(dismissed.pending).toBe(1);
  });

  it('sums priced cost only, counts unpriced runs, keeps previous-period trend fields (AC-22, AC-23, AC-28, AC-31..33)', async () => {
    const f = await fresh();
    const a = await f.agent('A');
    const b = await f.agent('B');
    await f.run(a, FROM_MS + DAY, { costUsd: 0.1 });
    await f.run(a, FROM_MS + 3 * DAY, { costUsd: 0.2 });
    await f.run(a, FROM_MS + 2 * DAY, { costUsd: null });
    await f.run(a, FROM_MS + 2 * DAY + HOUR, { costUsd: null });
    await f.run(b, FROM_MS + DAY, { costUsd: null });
    // previous period only for B, with decisions
    const pr = await f.run(b, FROM_MS - 3 * DAY, { costUsd: 0.4 });
    await f.decide(pr, ['accepted', 'dismissed']);
    const { body } = await f.perf();
    const ra = f.row(body, a);
    expect(ra.total_cost_usd).toBeCloseTo(0.3);
    expect(ra.unpriced_runs).toBe(2);
    expect(ra.last_run_at).toBe(new Date(FROM_MS + 3 * DAY).toISOString());
    const rb = f.row(body, b);
    expect(rb.total_cost_usd).toBeNull();
    expect(rb.prev_decided).toBe(2);
    expect(rb.prev_accept_rate).toBeCloseTo(0.5);
    expect(body.summary.total_cost_usd).toBeCloseTo(0.3);
    expect(body.summary.unpriced_runs).toBe(3);

    // previous-only: current null, previous set
    const only = await fresh();
    const c = await only.agent('C');
    await only.run(c, FROM_MS - 2 * DAY, { costUsd: 0.5 });
    const o = (await only.perf()).body;
    expect(o.summary.total_cost_usd).toBeNull();
    expect(o.summary.prev_total_cost_usd).toBeCloseTo(0.5);
    const st = await only.stats(c);
    expect(st.body.prev_avg_cost_usd).toBeCloseTo(0.5);
  });

  it('returns the 5 newest recent runs (AC-35)', async () => {
    const f = await fresh();
    const a = await f.agent('A');
    for (let i = 0; i < 7; i += 1) await f.run(a, FROM_MS + (i + 1) * HOUR);
    const row = f.row((await f.perf()).body, a);
    expect(row.recent_runs).toHaveLength(5);
    const times = row.recent_runs.map((r) => Date.parse(r.ran_at));
    expect(times).toEqual([7, 6, 5, 4, 3].map((i) => FROM_MS + i * HOUR));
  });

  it('stats equal the dashboard row field by field for 3 periods (AC-29)', async () => {
    const f = await fresh();
    const a = await f.agent('A');
    const b = await f.agent('B', false);
    for (let i = 0; i < 12; i += 1) {
      const id = await f.run(i % 3 === 0 ? b : a, FROM_MS + i * 20 * HOUR, { costUsd: i % 4 === 0 ? null : 0.05 * i, durationMs: 500 + i });
      await f.decide(id, i % 2 ? ['accepted', 'pending'] : ['dismissed']);
    }
    const periods = [
      q(),
      q(new Date(TO_MS - DAY).toISOString(), TO),
      q(new Date(FROM_MS + 2 * DAY).toISOString(), new Date(TO_MS - 2 * DAY).toISOString()),
    ];
    for (const pq of periods) {
      const { body } = await f.perf(pq);
      for (const id of [a, b]) {
        const r: AgentPerfRow = f.row(body, id);
        const s = (await f.stats(id, pq)).body;
        expect(s.runs).toBe(r.runs);
        expect(s.unpriced_runs).toBe(r.unpriced_runs);
        expect(s.avg_cost_usd).toBe(r.avg_cost_usd);
        expect(s.avg_duration_ms).toBe(r.avg_duration_ms);
        expect([s.accepted, s.dismissed, s.pending, s.decided]).toEqual([r.accepted, r.dismissed, r.pending, r.decided]);
        expect(s.accept_rate).toBe(r.accept_rate);
        expect(s.period).toEqual(body.period);
      }
    }
  });

  it('ignores running runs, deleted runs and reviews without a run (EC-1, EC-10, EC-11)', async () => {
    const f = await fresh();
    const a = await f.agent('A');
    const done = await f.run(a, FROM_MS + DAY);
    await f.decide(done, ['accepted']);
    const before = f.row((await f.perf()).body, a);

    await f.run(a, FROM_MS + 2 * DAY, { status: 'running' });
    const after = f.row((await f.perf()).body, a);
    expect(after.runs).toBe(before.runs);

    const doomed = await f.run(a, FROM_MS + 3 * DAY);
    await f.decide(doomed, ['accepted', 'accepted']);
    expect(f.row((await f.perf()).body, a).runs).toBe(2);
    await pg.handle.db.delete(t.agentRuns).where(eq(t.agentRuns.id, doomed)); // review stays (no FK)
    await f.decide(null, ['accepted']);
    const row = f.row((await f.perf()).body, a);
    expect(row.runs).toBe(1);
    expect(row.accepted).toBe(1);
    expect(row.decided).toBe(1);
  });

  it('counts multi-agent runs once per agent and CI runs without decisions (EC-18, EC-19)', async () => {
    const f = await fresh();
    const [m] = await pg.handle.db.insert(t.multiAgentRuns).values({ workspaceId: f.ws, prId: (await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.workspaceId, f.ws)))[0]!.id }).returning();
    const ids = [await f.agent('A'), await f.agent('B'), await f.agent('C')];
    for (const id of ids) await f.run(id, FROM_MS + DAY, { multiRunId: m!.id });
    const ci = await f.run(ids[0]!, FROM_MS + 2 * DAY, { source: 'ci', costUsd: 0.7, durationMs: 4000 });
    expect(ci).toBeTruthy();
    const { body } = await f.perf();
    expect(body.agents.map((r) => r.runs)).toEqual([2, 1, 1]);
    const a = f.row(body, ids[0]!);
    expect(a.decided).toBe(0);
    expect(a.total_cost_usd).toBeCloseTo(0.8);
    expect(a.recent_runs.some((r) => r.source === 'ci')).toBe(true);
  });

  it('serves /agents/performance as an aggregate, not an agent lookup (EC-13)', async () => {
    const f = await fresh();
    const res = await f.app.inject({ method: 'GET', url: `/agents/performance?${q()}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty('agents');
  });

  it('rejects invalid periods with 422 naming the parameter and no DB text (UT-1)', async () => {
    const f = await fresh();
    const cases: [string, string][] = [
      [q('2026-02-30T00:00:00Z', TO), 'from'],
      [q(TO, FROM), 'from'],
      [q('2025-01-01T00:00:00Z', '2026-02-05T00:00:00Z'), 'to'],
      ['from=2026-06-01T00:00:00Z', 'to'],
      ['to=2026-06-01T00:00:00Z', 'from'],
    ];
    for (const [query, param] of cases) {
      for (const url of ['/agents/performance', `/agents/${randomUUID()}/stats`]) {
        const res = await f.app.inject({ method: 'GET', url: `${url}?${query}` });
        expect(res.statusCode).toBe(422);
        const text = res.body;
        expect(text).toContain(`"${param}"`);
        expect(text.toLowerCase()).not.toMatch(/select |postgres|relation "/);
      }
    }
  });

  it('never exposes a run error (UT-7)', async () => {
    const f = await fresh();
    const a = await f.agent('A');
    const token = `sk-${randomUUID().replace(/-/g, '')}`;
    await f.run(a, FROM_MS + DAY, { status: 'failed', error: `401 Incorrect API key ${token}` });
    const p = await f.app.inject({ method: 'GET', url: `/agents/performance?${q()}` });
    const s = await f.app.inject({ method: 'GET', url: `/agents/${a}/stats?${q()}` });
    expect(p.body).not.toContain(token);
    expect(s.body).not.toContain(token);
    expect(f.row(p.json() as AgentPerf, a).runs).toBe(1);
  });

  it('is read-only and never calls a model (AC-67, NFR-3)', async () => {
    const f = await fresh();
    const a = await f.agent('A');
    await f.run(a, FROM_MS + DAY);
    const count = async () => (await pg.handle.db.select({ n: sql<number>`count(*)::int` }).from(t.agentRuns))[0]!.n;
    const before = await count();
    const callsBefore = llm.calls.length;
    await f.perf();
    await f.stats(a);
    expect(llm.calls.length).toBe(callsBefore);
    expect(await count()).toBe(before);
  });

  it('is deterministic and workspace-scoped (NFR-4, NFR-9)', async () => {
    const f = await fresh();
    const other = await fresh();
    const a = await f.agent('A');
    const b = await f.agent('B');
    await f.run(a, FROM_MS + DAY);
    await f.run(b, FROM_MS + DAY);
    const oa = await other.agent('A');
    await other.run(oa, FROM_MS + DAY);
    await other.run(oa, FROM_MS + 2 * DAY);
    const first = (await f.perf()).res.body;
    const second = (await f.perf()).res.body;
    expect(JSON.parse(second)).toEqual(JSON.parse(first));
    expect((JSON.parse(first) as AgentPerf).summary.runs).toBe(2);
    expect((await f.stats(a)).body.runs).toBe(1);
  });
});
