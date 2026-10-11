/**
 * SPEC-05 read paths (U11) over a real Postgres (Testcontainers): no read route
 * ever resolves or calls an LLM (AC-33), and the dashboard / agent page answer
 * within 1 s at 10 agents × 100 runs × 50 cases (NFR-3).
 * Gated on Docker like the other `*.it.test.ts` files.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { EvalCaseOutcome, LLMProvider } from '@devdigest/shared';
import { EvalAgentDetail, EvalDashboard, EvalRunStarted } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { REVIEW_ON_A2, stubLlm } from './helpers/eval-fakes.js';
import { buildApp } from '../src/app.js';
import { loadConfig, type AppConfig } from '../src/platform/config.js';
import { MockAuthProvider, MockSecretsProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[eval-read] Docker not available — skipping integration tests.');
}

const DIFF_A = ['diff --git a/src/a.ts b/src/a.ts', '--- a/src/a.ts', '+++ b/src/a.ts', '@@ -1,2 +1,4 @@\n a\n+b\n+c\n d'].join('\n');
const EXPECTATION = { type: 'must_find', file: 'src/a.ts', start_line: 2, end_line: 2 };

/** A provider that fails the test if anything touches it. */
function throwingProvider(counter: { calls: number }): LLMProvider {
  const boom = async (): Promise<never> => {
    counter.calls++;
    throw new Error('LLM must not be called on a read path');
  };
  return { id: 'openai', listModels: boom, complete: boom, embed: boom, completeStructured: boom };
}

d('Eval read paths (Testcontainers pg)', () => {
  let pg: PgFixture;
  let ws: string;
  const apps: FastifyInstance[] = [];

  beforeAll(async () => {
    pg = await startPg();
    const [w] = await pg.handle.db.insert(t.workspaces).values({ name: 'read-ws' }).returning();
    ws = w!.id;
  });
  afterAll(async () => {
    for (const a of apps) await a.close();
    await pg?.stop();
  });

  async function mkApp(llm?: LLMProvider) {
    const app = await buildApp({
      config: { ...loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv), logLevel: 'silent' } as AppConfig,
      db: pg.handle.db,
      overrides: {
        auth: new MockAuthProvider(undefined, { id: ws, name: 'ws' }),
        secrets: new MockSecretsProvider({}),
        ...(llm ? { llm: { openai: llm, openrouter: llm, anthropic: llm } } : {}),
      },
    });
    apps.push(app);
    return app;
  }

  async function mkAgent(name: string) {
    const [a] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId: ws, name, provider: 'openai', model: 'gpt-x', systemPrompt: 'be strict' })
      .returning();
    return a!.id;
  }

  const caseValues = (agentId: string, name: string) => ({
    workspaceId: ws,
    ownerKind: 'agent' as const,
    ownerId: agentId,
    name,
    inputDiff: DIFF_A,
    inputFiles: ['src/a.ts'],
    inputMeta: { pr_id: null, pr_number: null, title: 'T', body: null },
    expectedOutput: EXPECTATION,
  });

  it('AC-33: every read route answers without a single LLM call (and without resolving a provider)', async () => {
    const agent = await mkAgent('reader');
    const caseIds: string[] = [];
    for (let i = 0; i < 2; i++) {
      const [c] = await pg.handle.db.insert(t.evalCases).values(caseValues(agent, `case-${i}`)).returning();
      caseIds.push(c!.id);
    }
    // Two completed runs, made with a working stub.
    const writer = await mkApp(stubLlm(() => REVIEW_ON_A2));
    const runs: string[] = [];
    for (let i = 0; i < 2; i++) {
      runs.push(EvalRunStarted.parse((await writer.inject({ method: 'POST', url: `/agents/${agent}/eval-runs` })).json()).run_id);
      await writer.container.evalService.idle();
    }

    const counter = { calls: 0 };
    const reader = await mkApp(throwingProvider(counter));
    const urls = [
      '/eval/dashboard',
      `/eval/agents/${agent}`,
      `/agents/${agent}/eval-cases`,
      `/eval-cases/${caseIds[0]}`,
      `/agents/${agent}/eval-runs`,
      `/agents/${agent}/eval-runs/estimate`,
      `/eval-runs/${runs[0]}`,
      `/eval-runs/compare?a=${runs[0]}&b=${runs[1]}`,
    ];
    for (const url of urls) {
      const res = await reader.inject({ method: 'GET', url });
      expect(res.statusCode, `${url} → ${res.body}`).toBe(200);
    }
    expect(counter.calls).toBe(0);
  });

  it('NFR-3: dashboard and agent page respond within 1 s at 10 agents × 100 runs × 50 cases', async () => {
    const db = pg.handle.db;
    const perf = await (async () => {
      const [w] = await db.insert(t.workspaces).values({ name: 'perf-ws' }).returning();
      return w!.id;
    })();
    const agentIds: string[] = [];
    for (let a = 0; a < 10; a++) {
      const [agent] = await db
        .insert(t.agents)
        .values({ workspaceId: perf, name: `perf-agent-${a}`, provider: 'openai', model: 'gpt-x', systemPrompt: 'p' })
        .returning();
      agentIds.push(agent!.id);
      const cases = await db
        .insert(t.evalCases)
        .values(Array.from({ length: 50 }, (_, i) => ({ ...caseValues(agent!.id, `c-${a}-${i}`), workspaceId: perf })))
        .returning({ id: t.evalCases.id, name: t.evalCases.name });
      const outcomes: EvalCaseOutcome[] = cases.map((c, i) => ({
        case_id: c.id,
        name: c.name,
        expectation_type: 'must_find',
        status: 'scored',
        pass: i % 3 !== 0,
        error_reason: null,
        findings_total: 2,
        findings_matched: i % 3 !== 0 ? 1 : 0,
        grounding_kept: 2,
        grounding_total: 2,
        actual: [
          { file: 'src/a.ts', start_line: 2, end_line: 3, severity: 'WARNING', category: 'bug', title: 'Finding title', rationale: 'Because of reasons that take some space.', matched: true },
          { file: 'src/a.ts', start_line: 3, end_line: 4, severity: 'WARNING', category: 'bug', title: 'Another title', rationale: 'More reasons that take some space.', matched: false },
        ],
        duration_ms: 1200,
        cost_usd: 0.002,
      }));
      const runRows = Array.from({ length: 100 }, (_, r) => ({
        workspaceId: perf,
        ownerKind: 'agent' as const,
        ownerId: agent!.id,
        status: 'completed' as const,
        agentVersion: 1 + Math.floor(r / 10),
        caseIds: cases.map((c) => c.id),
        casesPassed: 33,
        casesTotal: 50,
        casesErrored: 0,
        uncoveredFindings: 50,
        perCase: outcomes,
        ranAt: new Date(Date.now() - (100 - r) * 3_600_000),
        finishedAt: new Date(Date.now() - (100 - r) * 3_600_000 + 60_000),
        recall: 0.66 + (r % 5) / 100,
        precision: 0.8,
        citationAccuracy: 1,
        durationMs: 60_000,
        costUsd: 0.1,
      }));
      for (let i = 0; i < runRows.length; i += 25) await db.insert(t.evalRuns).values(runRows.slice(i, i + 25));
    }

    const app = await buildApp({
      config: { ...loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv), logLevel: 'silent' } as AppConfig,
      db,
      overrides: { auth: new MockAuthProvider(undefined, { id: perf, name: 'perf' }), secrets: new MockSecretsProvider({}) },
    });
    apps.push(app);

    const timed = async (url: string) => {
      const t0 = performance.now();
      const res = await app.inject({ method: 'GET', url });
      return { res, ms: performance.now() - t0 };
    };
    await timed('/eval/dashboard'); // warm the pool and the plan cache; the budget applies to a normal request

    const dash = await timed('/eval/dashboard');
    expect(dash.res.statusCode).toBe(200);
    expect(EvalDashboard.parse(dash.res.json()).agents).toHaveLength(10);
    expect(dash.ms).toBeLessThan(1000);

    for (const id of agentIds.slice(0, 3)) {
      const page = await timed(`/eval/agents/${id}`);
      expect(page.res.statusCode).toBe(200);
      const detail = EvalAgentDetail.parse(page.res.json());
      expect(detail.runs).toHaveLength(100);
      expect(page.ms).toBeLessThan(1000);
    }
  });
});
