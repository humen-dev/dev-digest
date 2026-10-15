/**
 * SPEC-09 NFR-1 / NFR-2 over a real Postgres (Testcontainers): 50 agents x 200 runs
 * answer within 1 s, and the number of SQL queries does not depend on the agent count.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { FastifyInstance } from 'fastify';
import type { AgentPerf } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig, type AppConfig } from '../src/platform/config.js';
import { MockAuthProvider } from '../src/adapters/mocks.js';
import { schema } from '../src/db/schema.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[agent-performance-perf] Docker not available — skipping integration tests.');
}

const AGENTS = 50;
const RUNS_PER_AGENT = 200;
const HOUR = 3_600_000;
const CHUNK = 1000;

d('Agent performance — scale (Testcontainers pg)', () => {
  let pg: PgFixture;
  let big: string;
  let small: string;
  let app: FastifyInstance;
  let smallApp: FastifyInstance;
  let queries = 0;

  beforeAll(async () => {
    pg = await startPg();
    const db = pg.handle.db;
    const [w1] = await db.insert(t.workspaces).values({ name: 'perf-big' }).returning();
    const [w2] = await db.insert(t.workspaces).values({ name: 'perf-small' }).returning();
    big = w1!.id;
    small = w2!.id;
    const [repo] = await db.insert(t.repos).values({ workspaceId: big, owner: 'a', name: 'b', fullName: 'a/big' }).returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({ workspaceId: big, repoId: repo!.id, number: 1, title: 'p', author: 'x', branch: 'f', base: 'main', headSha: 's' })
      .returning();

    const mkAgents = (ws: string, n: number) =>
      db
        .insert(t.agents)
        .values(Array.from({ length: n }, (_, i) => ({ workspaceId: ws, name: `Agent ${String(i).padStart(2, '0')}`, provider: 'openai' as const, model: 'm', systemPrompt: 'x' })))
        .returning();
    const bigAgents = await mkAgents(big, AGENTS);
    const smallAgents = await mkAgents(small, 1);

    const now = Date.now();
    const runRows = (ws: string, agentId: string, n: number) =>
      Array.from({ length: n }, (_, i) => ({
        workspaceId: ws,
        agentId,
        ranAt: new Date(now - (i % 700) * HOUR),
        status: 'done',
        model: 'gpt',
        durationMs: 1000 + i,
        costUsd: i % 5 === 0 ? null : 0.01,
      }));
    const all = [
      ...bigAgents.flatMap((a) => runRows(big, a.id, RUNS_PER_AGENT)),
      ...runRows(small, smallAgents[0]!.id, RUNS_PER_AGENT),
    ];
    const ids: string[] = [];
    for (let i = 0; i < all.length; i += CHUNK) {
      const out = await db.insert(t.agentRuns).values(all.slice(i, i + CHUNK)).returning({ id: t.agentRuns.id, ws: t.agentRuns.workspaceId });
      for (const r of out) if (r.ws === big) ids.push(r.id);
    }
    const decided = ids.filter((_, i) => i % 5 === 0);
    for (let i = 0; i < decided.length; i += CHUNK) {
      const revs = await db
        .insert(t.reviews)
        .values(decided.slice(i, i + CHUNK).map((runId) => ({ workspaceId: big, prId: pr!.id, runId, kind: 'review' as const })))
        .returning({ id: t.reviews.id });
      await db.insert(t.findings).values(
        revs.flatMap((r, j) =>
          [0, 1].map((k) => ({
            reviewId: r.id,
            file: 'f.ts',
            startLine: 1,
            endLine: 1,
            severity: 'warning',
            category: 'bug',
            title: 't',
            rationale: 'r',
            confidence: 0.9,
            acceptedAt: (i + j + k) % 2 ? new Date() : null,
          })),
        ),
      );
    }

    // A drizzle instance that counts every statement it sends.
    const counting = drizzle(pg.handle.sql, { schema, logger: { logQuery: () => void (queries += 1) } });
    const base = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const mk = (ws: string) =>
      buildApp({
        config: { ...base, logLevel: 'silent' } as AppConfig,
        db: counting,
        overrides: { auth: new MockAuthProvider(undefined, { id: ws, name: 'ws' }) },
      });
    app = await mk(big);
    smallApp = await mk(small);
  }, 300_000);

  afterAll(async () => {
    await app?.close();
    await smallApp?.close();
    await pg?.stop();
  });

  it('answers 50 agents x 200 runs in under 1 s (NFR-1)', async () => {
    const started = performance.now();
    const res = await app.inject({ method: 'GET', url: '/agents/performance' });
    const elapsed = performance.now() - started;
    expect(res.statusCode).toBe(200);
    expect((res.json() as AgentPerf).agents).toHaveLength(AGENTS);
    expect(elapsed).toBeLessThan(1000);
  });

  it('issues the same number of queries for 1 and 50 agents (NFR-2)', async () => {
    const measure = async (a: FastifyInstance) => {
      queries = 0;
      const res = await a.inject({ method: 'GET', url: '/agents/performance' });
      expect(res.statusCode).toBe(200);
      return queries;
    };
    const many = await measure(app);
    const one = await measure(smallApp);
    expect(one).toBeGreaterThan(0);
    expect(many).toBe(one);
  });
});
