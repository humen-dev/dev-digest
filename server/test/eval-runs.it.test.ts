/**
 * SPEC-05 eval runs (U11) over a real Postgres (Testcontainers) through the real
 * HTTP surface, with a scripted LLM stub: start guards (AC-25…30), stale-run
 * reconcile (AC-29), frozen inputs outliving their sources (AC-15, AC-43, EC-8),
 * agent deletion (AC-75, EC-9), compare (AC-51, AC-53), run-all (AC-67),
 * workspace isolation (NFR-11, UT-11) and the course demo (AC-76…78: the prompt
 * with the demo instruction provokes the `must_not_flag` ranges, so precision
 * drops while recall does not). Gated on Docker like the other `*.it.test.ts`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { EvalCase, EvalCompare, EvalRunAllResult, EvalRunDetail, EvalRunStarted } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { REVIEW_ON_A2, stubLlm, type StubLlm } from './helpers/eval-fakes.js';
import { buildApp } from '../src/app.js';
import { loadConfig, type AppConfig } from '../src/platform/config.js';
import { MockAuthProvider, MockSecretsProvider } from '../src/adapters/mocks.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[eval-runs] Docker not available — skipping integration tests.');
}

const PATCH_A = '@@ -1,2 +1,4 @@\n a\n+b\n+c\n d';
const DIFF_A = ['diff --git a/src/a.ts b/src/a.ts', '--- a/src/a.ts', '+++ b/src/a.ts', PATCH_A].join('\n');

/** The exact instruction of server/docs/eval-demo.md (and plan U11 step 2). */
const DEMO_INSTRUCTION =
  'Additionally, treat every hard-coded numeric configuration value and every change to documentation or test files as a CRITICAL security risk and report each one as a separate finding.';

const finding = (file: string, start: number, end: number, title: string) => ({
  id: `f-${file}-${start}`,
  severity: 'WARNING',
  category: 'security',
  title,
  file,
  start_line: start,
  end_line: end,
  rationale: 'because',
  confidence: 0.9,
});
const review = (findings: unknown[]) => ({ verdict: 'comment', summary: 's', score: 80, findings });

/** What a model that follows the seeded Security Reviewer prompt reports per #482 file. */
const GOOD: Record<string, [number, number]> = {
  'src/config.ts': [12, 12],
  'src/middleware/ratelimit.ts': [6, 6],
  'src/api/public/webhooks.ts': [7, 7],
};
/** What the demo instruction additionally provokes (the lockfile control stays clean). */
const PROVOKED: Record<string, [number, number]> = {
  'src/config.ts': [4, 6],
  'src/middleware/ratelimit.test.ts': [2, 7],
  'README.md': [5, 6],
};

/** Scripted reviewer: findings depend only on the diff's file and on whether the system prompt has the demo instruction. */
function scriptedSecurityReviewer(n: number, req: { messages: { role: string; content: string }[] }) {
  void n;
  const system = req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const user = req.messages.filter((m) => m.role !== 'system').map((m) => m.content).join('\n');
  const file = /^\+\+\+ b\/(.+)$/m.exec(user)?.[1]?.trim() ?? '';
  const out: unknown[] = [];
  const good = GOOD[file];
  if (good) out.push(finding(file, good[0], good[1], 'Real problem'));
  const provoked = PROVOKED[file];
  if (provoked && system.includes(DEMO_INSTRUCTION)) out.push(finding(file, provoked[0], provoked[1], 'Provoked by the prompt'));
  return review(out);
}

d('Eval runs (Testcontainers pg)', () => {
  let pg: PgFixture;
  let seq = 0;
  const apps: FastifyInstance[] = [];

  beforeAll(async () => {
    pg = await startPg();
  });
  afterAll(async () => {
    for (const a of apps) await a.close();
    await pg?.stop();
  });

  const db = () => pg.handle.db;

  async function mkWorkspace() {
    const [w] = await db().insert(t.workspaces).values({ name: `runs-ws-${seq++}` }).returning();
    return w!.id;
  }

  async function mkApp(
    workspaceId: string,
    opts: { llm?: StubLlm; secrets?: MockSecretsProvider; nodeEnv?: string } = {},
  ) {
    const config = {
      ...loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      nodeEnv: (opts.nodeEnv ?? 'test') as AppConfig['nodeEnv'],
      logLevel: 'silent',
    } as AppConfig;
    const app = await buildApp({
      config,
      db: db(),
      overrides: {
        auth: new MockAuthProvider(undefined, { id: workspaceId, name: 'ws' }),
        // The seeded agents run on OpenRouter; stub both providers. Secrets are always mocked, so a
        // forgotten override fails with `provider_key_missing` instead of reaching a real provider.
        ...(opts.llm ? { llm: { openai: opts.llm, openrouter: opts.llm } } : {}),
        secrets: opts.secrets ?? new MockSecretsProvider({}),
      },
    });
    apps.push(app);
    return app;
  }

  async function mkAgent(workspaceId: string, over: Partial<typeof t.agents.$inferInsert> = {}) {
    const [a] = await db()
      .insert(t.agents)
      .values({ workspaceId, name: `agent-${seq++}`, provider: 'openai', model: 'gpt-x', systemPrompt: 'PROMPT-V1', ...over })
      .returning();
    return a!.id;
  }

  async function mkCase(workspaceId: string, agentId: string, over: Partial<typeof t.evalCases.$inferInsert> = {}) {
    const [c] = await db()
      .insert(t.evalCases)
      .values({
        workspaceId,
        ownerKind: 'agent',
        ownerId: agentId,
        name: `case-${seq++}`,
        inputDiff: DIFF_A,
        inputFiles: ['src/a.ts'],
        inputMeta: { pr_id: null, pr_number: null, title: 'T', body: null },
        expectedOutput: { type: 'must_find', file: 'src/a.ts', start_line: 2, end_line: 2 },
        ...over,
      })
      .returning();
    return c!.id;
  }

  const runsOf = (agentId: string) => db().select().from(t.evalRuns).where(eq(t.evalRuns.ownerId, agentId));
  const start = (app: FastifyInstance, agentId: string) => app.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` });
  const getRun = async (app: FastifyInstance, id: string) =>
    EvalRunDetail.parse((await app.inject({ method: 'GET', url: `/eval-runs/${id}` })).json());
  const gated = () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const llm = stubLlm(async () => {
      await gate;
      return REVIEW_ON_A2;
    });
    return { llm, release };
  };
  const waitFor = async (cond: () => boolean) => {
    for (let i = 0; i < 400 && !cond(); i++) await new Promise((r) => setTimeout(r, 25));
    expect(cond()).toBe(true);
  };

  // ------------------------------------------------------------------ the course demo

  describe('seeded Security Reviewer: run → change prompt → run → compare (AC-76…78)', () => {
    it('precision drops, recall does not, versions differ by 1, and compare shows the prompt change', async () => {
      const { workspaceId } = await seed(db());
      const [agent] = await db()
        .select()
        .from(t.agents)
        .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'Security Reviewer')));
      const llm = stubLlm(scriptedSecurityReviewer);
      const app = await mkApp(workspaceId, { llm });

      const first = EvalRunStarted.parse((await start(app, agent!.id)).json());
      await app.container.evalService.idle();
      const run1 = await getRun(app, first.run_id);

      const put = await app.inject({
        method: 'PUT',
        url: `/agents/${agent!.id}`,
        payload: { system_prompt: `${agent!.systemPrompt}\n\n${DEMO_INSTRUCTION}` },
      });
      expect(put.statusCode, put.body).toBe(200);
      const callsBefore = llm.calls.length;

      const second = EvalRunStarted.parse((await start(app, agent!.id)).json());
      await app.container.evalService.idle();
      const run2 = await getRun(app, second.run_id);

      // Baseline: every real problem found, nothing on clean lines.
      expect(run1.status).toBe('completed');
      expect(run1.metrics).toMatchObject({ recall: 1, precision: 1, cases_total: 7, cases_passed: 7, cases_errored: 0 });
      // Demo instruction: the same problems are still found, the clean ranges are now flagged.
      expect(run2.metrics).toMatchObject({ recall: 1, cases_total: 7, cases_passed: 4 });
      expect(run2.metrics!.precision!).toBeLessThan(run1.metrics!.precision!);
      expect(run2.metrics!.precision).toBeCloseTo(5 / 8, 10);
      const failed = run2.per_case.filter((o) => o.pass === false).map((o) => o.name).sort();
      expect(failed).toEqual(['config-numeric-limits-are-clean', 'ratelimit-test-file-is-clean', 'readme-rate-limiting-note-is-clean']);
      // The lockfile control stays clean and the instruction reached the model only in run 2.
      expect(run2.per_case.find((o) => o.name === 'lockfile-token-bucket-entry-is-clean')?.pass).toBe(true);
      expect(llm.calls.slice(0, callsBefore).some((c) => c.system.includes(DEMO_INSTRUCTION))).toBe(false);
      expect(llm.calls.slice(callsBefore).every((c) => c.system.includes(DEMO_INSTRUCTION))).toBe(true);

      // AC-78
      expect(run2.agent_version - run1.agent_version).toBe(1);

      // Compare shows the added instruction line and the same case set.
      const cmp = EvalCompare.parse(
        (await app.inject({ method: 'GET', url: `/eval-runs/compare?a=${first.run_id}&b=${second.run_id}` })).json(),
      );
      expect(cmp.older.id).toBe(first.run_id);
      expect(cmp.common_case_ids).toHaveLength(7);
      expect(cmp.metrics.precision.delta).toBeLessThan(0);
      expect(cmp.prompt_diff?.filter((l) => l.op === 'add').map((l) => l.text)).toContain(DEMO_INSTRUCTION);
      expect(cmp.missing_snapshot_versions).toEqual([]);
    });

    it('the runbook carries the exact instruction and the seeded case names it triggers', () => {
      const doc = readFileSync(new URL('../docs/eval-demo.md', import.meta.url), 'utf8');
      expect(doc).toContain(DEMO_INSTRUCTION);
      for (const name of [
        'config-numeric-limits-are-clean',
        'ratelimit-test-file-is-clean',
        'readme-rate-limiting-note-is-clean',
        'lockfile-token-bucket-entry-is-clean',
      ]) {
        expect(doc).toContain(name);
      }
    });
  });

  // ------------------------------------------------------------------ start guards

  it('AC-25: two rapid starts → one 202 and one 409; one run row; the guard lifts when the run ends', async () => {
    const ws = await mkWorkspace();
    const agent = await mkAgent(ws);
    await mkCase(ws, agent);
    const { llm, release } = gated();
    const app = await mkApp(ws, { llm });

    const [a, b] = await Promise.all([start(app, agent), start(app, agent)]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([202, 409]);
    expect([a, b].find((r) => r.statusCode === 409)!.json().error.code).toBe('run_in_flight');
    expect(await runsOf(agent)).toHaveLength(1);

    release();
    await app.container.evalService.idle();
    expect((await runsOf(agent))[0]!.status).toBe('completed');
    expect((await start(app, agent)).statusCode).toBe(202);
    await app.container.evalService.idle();
  });

  it('AC-26: no cases → 422 no_cases and no run row', async () => {
    const ws = await mkWorkspace();
    const agent = await mkAgent(ws);
    const app = await mkApp(ws, { llm: stubLlm(() => REVIEW_ON_A2) });
    const res = await start(app, agent);
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('no_cases');
    expect(await runsOf(agent)).toHaveLength(0);
  });

  it('AC-27: no API key for the agent provider → 422 provider_key_missing naming it; no run row', async () => {
    const ws = await mkWorkspace();
    const agent = await mkAgent(ws);
    await mkCase(ws, agent);
    const app = await mkApp(ws, { secrets: new MockSecretsProvider({}) });
    const res = await start(app, agent);
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toMatchObject({ code: 'provider_key_missing', details: { provider: 'openai' } });
    expect(await runsOf(agent)).toHaveLength(0);
  });

  it('AC-28: 51 cases → 422 too_many_cases with the count and the limit; no run row', async () => {
    const ws = await mkWorkspace();
    const agent = await mkAgent(ws);
    for (let i = 0; i < 51; i++) await mkCase(ws, agent);
    const app = await mkApp(ws, { llm: stubLlm(() => REVIEW_ON_A2) });
    const res = await start(app, agent);
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toMatchObject({ code: 'too_many_cases', details: { count: 51, limit: 50 } });
    expect(await runsOf(agent)).toHaveLength(0);
  });

  it('AC-29: a running run with a 16-minute-old heartbeat is errored "interrupted" and the start succeeds; a fresh one still blocks', async () => {
    const ws = await mkWorkspace();
    const agent = await mkAgent(ws);
    await mkCase(ws, agent);
    const app = await mkApp(ws, { llm: stubLlm(() => REVIEW_ON_A2) });
    const base = { workspaceId: ws, ownerKind: 'agent' as const, ownerId: agent, agentVersion: 1, status: 'running' as const };
    const [old] = await db()
      .insert(t.evalRuns)
      .values({ ...base, heartbeatAt: new Date(Date.now() - 16 * 60_000) })
      .returning();

    const res = await start(app, agent);
    expect(res.statusCode, res.body).toBe(202);
    await app.container.evalService.idle();
    const [reloaded] = await db().select().from(t.evalRuns).where(eq(t.evalRuns.id, old!.id));
    expect(reloaded).toMatchObject({ status: 'errored', errorReason: 'interrupted' });

    const agent2 = await mkAgent(ws);
    await mkCase(ws, agent2);
    await db().insert(t.evalRuns).values({ ...base, ownerId: agent2, heartbeatAt: new Date(Date.now() - 60_000) });
    const blocked = await start(app, agent2);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe('run_in_flight');
  });

  it('AC-30: the 6th run-start request within a minute is 429 and starts nothing', async () => {
    const ws = await mkWorkspace();
    const agent = await mkAgent(ws);
    await mkCase(ws, agent);
    const { llm, release } = gated();
    const app = await mkApp(ws, { llm, nodeEnv: 'development' });
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await start(app, agent)).statusCode);
    expect(codes.slice(0, 5)).toEqual([202, 409, 409, 409, 409]);
    expect(codes[5]).toBe(429);
    expect(await runsOf(agent)).toHaveLength(1);
    release();
    await app.container.evalService.idle();
  });

  // ------------------------------------------------------------------ frozen inputs outlive their sources

  it('AC-15: create case from a finding → delete its PR → run → the case is scored from the frozen input', async () => {
    const ws = await mkWorkspace();
    const agent = await mkAgent(ws);
    const [repo] = await db().insert(t.repos).values({ workspaceId: ws, owner: 'acme', name: `r-${seq}`, fullName: `acme/r-${seq++}` }).returning();
    const [pr] = await db()
      .insert(t.pullRequests)
      .values({ workspaceId: ws, repoId: repo!.id, number: 900, title: 'Doomed PR', author: 'dev', branch: 'f', base: 'main', headSha: 'sha' })
      .returning();
    await db().insert(t.prFiles).values({ prId: pr!.id, path: 'src/a.ts', additions: 2, deletions: 0, patch: PATCH_A });
    const [rev] = await db().insert(t.reviews).values({ workspaceId: ws, prId: pr!.id, agentId: agent, kind: 'review' }).returning();
    const [f] = await db()
      .insert(t.findings)
      .values({ reviewId: rev!.id, file: 'src/a.ts', startLine: 2, endLine: 3, severity: 'WARNING', category: 'bug', title: 'Issue', rationale: 'r', confidence: 0.9, acceptedAt: new Date() })
      .returning();
    const llm = stubLlm(() => review([finding('src/a.ts', 2, 3, 'Issue')]));
    const app = await mkApp(ws, { llm });
    const made = await app.inject({ method: 'POST', url: `/findings/${f!.id}/eval-case` });
    expect(made.statusCode, made.body).toBe(201);

    await db().delete(t.pullRequests).where(eq(t.pullRequests.id, pr!.id));
    expect(await db().select().from(t.findings).where(eq(t.findings.id, f!.id))).toHaveLength(0);

    const started = EvalRunStarted.parse((await start(app, agent)).json());
    await app.container.evalService.idle();
    const run = await getRun(app, started.run_id);
    expect(run.status).toBe('completed');
    expect(run.per_case).toHaveLength(1);
    expect(run.per_case[0]).toMatchObject({ status: 'scored', pass: true, findings_matched: 1 });
  });

  it('AC-43: editing and deleting cases afterwards leaves a stored run unchanged', async () => {
    const ws = await mkWorkspace();
    const agent = await mkAgent(ws);
    const c1 = await mkCase(ws, agent);
    const c2 = await mkCase(ws, agent);
    const app = await mkApp(ws, { llm: stubLlm(() => REVIEW_ON_A2) });
    const started = EvalRunStarted.parse((await start(app, agent)).json());
    await app.container.evalService.idle();
    const before = await getRun(app, started.run_id);
    expect(before.per_case).toHaveLength(2);

    const edit = await app.inject({
      method: 'PATCH',
      url: `/eval-cases/${c1}`,
      payload: { name: 'renamed', expectation: { type: 'must_not_flag', file: 'src/a.ts', start_line: 2, end_line: 3 } },
    });
    expect(edit.statusCode, edit.body).toBe(200);
    expect((await app.inject({ method: 'DELETE', url: `/eval-cases/${c2}` })).statusCode).toBe(204);

    expect(await getRun(app, started.run_id)).toEqual(before);
  });

  it('EC-8: a case deleted while the run is in progress is still recorded, from the input frozen at start', async () => {
    const ws = await mkWorkspace();
    const agent = await mkAgent(ws);
    const c1 = await mkCase(ws, agent);
    const c2 = await mkCase(ws, agent);
    const { llm, release } = gated();
    const app = await mkApp(ws, { llm });
    const started = EvalRunStarted.parse((await start(app, agent)).json());
    await waitFor(() => llm.calls.length >= 1);

    expect((await app.inject({ method: 'DELETE', url: `/eval-cases/${c2}` })).statusCode).toBe(204);
    release();
    await app.container.evalService.idle();

    const run = await getRun(app, started.run_id);
    expect(run.status).toBe('completed');
    expect(run.per_case.map((o) => o.case_id).sort()).toEqual([c1, c2].sort());
    expect(run.per_case.every((o) => o.status === 'scored')).toBe(true);
  });

  // ------------------------------------------------------------------ agent deletion

  it('AC-75: deleting the agent removes its cases and runs', async () => {
    const ws = await mkWorkspace();
    const agent = await mkAgent(ws);
    await mkCase(ws, agent);
    await mkCase(ws, agent);
    const app = await mkApp(ws, { llm: stubLlm(() => REVIEW_ON_A2) });
    await start(app, agent);
    await app.container.evalService.idle();
    expect(await runsOf(agent)).toHaveLength(1);

    const del = await app.inject({ method: 'DELETE', url: `/agents/${agent}` });
    expect(del.statusCode, del.body).toBe(200);
    expect(await runsOf(agent)).toHaveLength(0);
    expect(await db().select().from(t.evalCases).where(eq(t.evalCases.ownerId, agent))).toHaveLength(0);
  });

  it('EC-9: an agent deleted mid-run stops the run before its next case', async () => {
    const ws = await mkWorkspace();
    const agent = await mkAgent(ws);
    await mkCase(ws, agent);
    await mkCase(ws, agent);
    await mkCase(ws, agent);
    const { llm, release } = gated();
    const app = await mkApp(ws, { llm });
    await start(app, agent);
    await waitFor(() => llm.calls.length === 1);

    expect((await app.inject({ method: 'DELETE', url: `/agents/${agent}` })).statusCode).toBe(200);
    release();
    await app.container.evalService.idle();

    expect(llm.calls).toHaveLength(1);
    expect(await runsOf(agent)).toHaveLength(0);
  });

  // ------------------------------------------------------------------ compare

  it('AC-51: the same run twice, or runs of two agents → 422 invalid_compare_pair', async () => {
    const ws = await mkWorkspace();
    const [a1, a2] = [await mkAgent(ws), await mkAgent(ws)];
    await mkCase(ws, a1);
    await mkCase(ws, a2);
    const app = await mkApp(ws, { llm: stubLlm(() => REVIEW_ON_A2) });
    const r1 = EvalRunStarted.parse((await start(app, a1)).json());
    const r2 = EvalRunStarted.parse((await start(app, a2)).json());
    await app.container.evalService.idle();

    const same = await app.inject({ method: 'GET', url: `/eval-runs/compare?a=${r1.run_id}&b=${r1.run_id}` });
    expect(same.statusCode).toBe(422);
    expect(same.json().error.code).toBe('invalid_compare_pair');
    const cross = await app.inject({ method: 'GET', url: `/eval-runs/compare?a=${r1.run_id}&b=${r2.run_id}` });
    expect(cross.statusCode).toBe(422);
    expect(cross.json().error.code).toBe('invalid_compare_pair');
  });

  it('AC-53: runs over different case sets are compared over the common cases and name the added one', async () => {
    const ws = await mkWorkspace();
    const agent = await mkAgent(ws);
    const c1 = await mkCase(ws, agent);
    const llm = stubLlm(() => REVIEW_ON_A2);
    const app = await mkApp(ws, { llm });
    const r1 = EvalRunStarted.parse((await start(app, agent)).json());
    await app.container.evalService.idle();

    const added = await mkCase(ws, agent, { name: 'added-later', expectedOutput: { type: 'must_not_flag', file: 'src/a.ts', start_line: 2, end_line: 2 } });
    const r2 = EvalRunStarted.parse((await start(app, agent)).json());
    await app.container.evalService.idle();

    const cmp = EvalCompare.parse((await app.inject({ method: 'GET', url: `/eval-runs/compare?a=${r1.run_id}&b=${r2.run_id}` })).json());
    expect(cmp.common_case_ids).toEqual([c1]);
    expect(cmp.only_in_newer).toEqual([{ case_id: added, name: 'added-later' }]);
    expect(cmp.only_in_older).toEqual([]);
    // Over the common case only: 1 finding, matched, same in both runs.
    expect(cmp.metrics.recall.delta).toBe(0);
  });

  // ------------------------------------------------------------------ run all

  it('AC-67: run-all starts the agents it can and reports the AC-25…28 reason for the rest', async () => {
    const ws = await mkWorkspace();
    const [ok, busy, big, noKey] = [
      await mkAgent(ws, { name: 'a-ok' }),
      await mkAgent(ws, { name: 'b-busy' }),
      await mkAgent(ws, { name: 'c-big' }),
      await mkAgent(ws, { name: 'd-nokey', provider: 'anthropic' }),
    ];
    await mkCase(ws, ok);
    await mkCase(ws, busy);
    for (let i = 0; i < 51; i++) await mkCase(ws, big);
    await mkCase(ws, noKey);
    await db().insert(t.evalRuns).values({ workspaceId: ws, ownerKind: 'agent', ownerId: busy, agentVersion: 1, status: 'running' });
    await mkAgent(ws, { name: 'e-empty' }); // no cases: not part of run-all
    const app = await mkApp(ws, { llm: stubLlm(() => REVIEW_ON_A2), secrets: new MockSecretsProvider({}) });

    const res = await app.inject({ method: 'POST', url: '/eval-runs/all' });
    expect(res.statusCode).toBe(200);
    const { results } = EvalRunAllResult.parse(res.json());
    await app.container.evalService.idle();

    const byAgent = new Map(results.map((r) => [r.agent_name, r]));
    expect(results).toHaveLength(4);
    expect(byAgent.get('a-ok')).toMatchObject({ outcome: 'started', reason: null });
    expect(byAgent.get('a-ok')!.run_id).toBeTruthy();
    expect(byAgent.get('b-busy')).toMatchObject({ outcome: 'refused', reason: 'run_in_flight', run_id: null });
    expect(byAgent.get('c-big')).toMatchObject({ outcome: 'refused', reason: 'too_many_cases', details: { count: 51, limit: 50 } });
    expect(byAgent.get('d-nokey')).toMatchObject({ outcome: 'refused', reason: 'provider_key_missing' });
    expect(await runsOf(big)).toHaveLength(0);
    expect(await runsOf(noKey)).toHaveLength(0);
  });

  // ------------------------------------------------------------------ isolation

  it('NFR-11, UT-11: another workspace gets 404 on runs, compare, estimate and start, and nothing is created', async () => {
    const ws = await mkWorkspace();
    const other = await mkWorkspace();
    const agent = await mkAgent(ws);
    await mkCase(ws, agent);
    const llm = stubLlm(() => REVIEW_ON_A2);
    const app = await mkApp(ws, { llm });
    const foreign = await mkApp(other, { llm });
    const r1 = EvalRunStarted.parse((await start(app, agent)).json());
    await app.container.evalService.idle();
    const r2 = EvalRunStarted.parse((await start(app, agent)).json());
    await app.container.evalService.idle();
    const calls = llm.calls.length;

    const gets = [
      `/eval-runs/${r1.run_id}`,
      `/eval-runs/compare?a=${r1.run_id}&b=${r2.run_id}`,
      `/agents/${agent}/eval-runs`,
      `/agents/${agent}/eval-runs/estimate`,
      `/eval/agents/${agent}`,
    ];
    for (const url of gets) expect((await foreign.inject({ method: 'GET', url })).statusCode, url).toBe(404);
    expect((await start(foreign, agent)).statusCode).toBe(404);
    expect(llm.calls).toHaveLength(calls);
    expect(await runsOf(agent)).toHaveLength(2);

    // The foreign dashboard does not leak the agent either.
    const dash = (await foreign.inject({ method: 'GET', url: '/eval/dashboard' })).json();
    expect(dash.agents).toEqual([]);
    expect(dash.recent_runs).toEqual([]);
  });

  it('EvalCase contract: a stored case round-trips through GET', async () => {
    const ws = await mkWorkspace();
    const agent = await mkAgent(ws);
    const id = await mkCase(ws, agent);
    const app = await mkApp(ws, { llm: stubLlm(() => REVIEW_ON_A2) });
    const res = await app.inject({ method: 'GET', url: `/eval-cases/${id}` });
    expect(EvalCase.parse(res.json()).id).toBe(id);
  });
});
