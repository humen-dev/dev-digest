/**
 * SPEC-08 ingest end to end over a real Postgres (Testcontainers): `POST /ci/refresh`
 * with a `MockGitHubClient`, real repositories, real `agent_runs` mirror.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { strToU8, zipSync } from 'fflate';
import type { FastifyInstance } from 'fastify';
import { CiRefreshResult, RunTrace, type RunArtifact, type WorkflowRun } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig, type AppConfig } from '../src/platform/config.js';
import { MockAuthProvider, MockGitHubClient, MockSecretsProvider } from '../src/adapters/mocks.js';
import { WORKFLOW_PATH } from '../src/modules/ci/constants.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[ci-ingest] Docker not available — skipping integration tests.');
}

const REPO = 'acme/ingest';
const SHA = 'c'.repeat(40);
const meta = { commit_sha: SHA, repository: REPO, repository_id: 4242, pr_number: 8, pr_title: 'Ship it' };
const result = { findings_count: 4, critical: 1, warning: 2, suggestion: 1, cost_usd: 0.05, agent: 'Ingest Reviewer', duration_ms: 2500, verdict: 'request_changes', blockers: 1 };

const run = (id: number, over: Partial<WorkflowRun> = {}): WorkflowRun => ({
  id,
  run_attempt: 1,
  event: 'pull_request',
  status: 'completed',
  conclusion: 'failure',
  head_sha: SHA,
  html_url: `https://github.com/${REPO}/actions/runs/${id}`,
  path: WORKFLOW_PATH,
  repository_id: 4242,
  repository_full_name: REPO,
  repository_html_url: `https://github.com/${REPO}`,
  display_title: 't',
  created_at: '2026-10-12T09:00:00Z',
  run_started_at: '2026-10-12T09:00:05Z',
  pull_requests: [8],
  ...over,
});
const art = (id: number): RunArtifact => ({ id, name: 'devdigest-result', size_in_bytes: 500, expired: false });
const zip = (res: object, m: object = meta) =>
  zipSync({ 'devdigest-result.json': strToU8(JSON.stringify(res)), 'devdigest-run.json': strToU8(JSON.stringify(m)) });

d('CI ingest (Testcontainers pg)', () => {
  let pg: PgFixture;
  let ws: string;
  let agentId: string;
  let installationId: string;
  const apps: FastifyInstance[] = [];

  beforeAll(async () => {
    pg = await startPg();
    const [w] = await pg.handle.db.insert(t.workspaces).values({ name: 'ci-ingest' }).returning();
    ws = w!.id;
    const [a] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId: ws, name: 'Ingest Reviewer', provider: 'openrouter', model: 'openai/gpt-4o', systemPrompt: 'x' })
      .returning();
    agentId = a!.id;
    const [i] = await pg.handle.db
      .insert(t.ciInstallations)
      .values({
        workspaceId: ws,
        agentId,
        repo: REPO,
        targetType: 'gha',
        githubRepoId: 4242,
        prUrl: `https://github.com/${REPO}/pull/3`,
        state: 'pr_open',
      })
      .returning();
    installationId = i!.id;
  });
  afterAll(async () => {
    for (const a of apps) await a.close();
    await pg?.stop();
  });

  async function mkApp(gh: MockGitHubClient, token = true) {
    const base = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config: { ...base, logLevel: 'silent' } as AppConfig,
      db: pg.handle.db,
      overrides: {
        auth: new MockAuthProvider(undefined, { id: ws, name: 'ws' }),
        secrets: new MockSecretsProvider(token ? { GITHUB_TOKEN: 'ghs_notarealtoken' } : {}),
        github: gh,
      },
    });
    apps.push(app);
    return app;
  }
  const refresh = (app: FastifyInstance, force = true) =>
    app.inject({ method: 'POST', url: '/ci/refresh', payload: { force } });
  const ciRuns = () => pg.handle.db.select().from(t.ciRuns).where(eq(t.ciRuns.workspaceId, ws));
  const ciAgentRuns = () => pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.source, 'ci'));
  const reset = async () => {
    await pg.handle.db.delete(t.ciRuns).where(eq(t.ciRuns.workspaceId, ws));
    await pg.handle.db.delete(t.agentRuns).where(eq(t.agentRuns.workspaceId, ws));
    await pg.handle.db.update(t.ciInstallations).set({ lastRefreshedAt: null, state: 'pr_open' }).where(eq(t.ciInstallations.id, installationId));
  };

  it('answers 422 without a GitHub token (EC-1)', async () => {
    const app = await mkApp(new MockGitHubClient(), false);
    const res = await refresh(app);
    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toBe('Connect GitHub in Settings');
  });

  it('accepts an empty body as a non-forced refresh', async () => {
    const app = await mkApp(new MockGitHubClient());
    const res = await app.inject({ method: 'POST', url: '/ci/refresh' });
    expect(res.statusCode).toBe(200);
    expect(CiRefreshResult.parse(res.json()).skipped_debounced).toBe(0);
    await reset();
  });

  it('stores an accepted run as one ci_runs row and one mirrored agent_runs row (AC-73, AC-76, AC-58)', async () => {
    const gh = new MockGitHubClient({
      prStates: { 3: 'open' },
      workflowRuns: [run(1), run(2, { conclusion: 'success' })],
      artifacts: { 1: [art(11)] },
      artifactZips: { 11: zip(result) },
    });
    const app = await mkApp(gh);
    const res = await refresh(app);
    expect(CiRefreshResult.parse(res.json())).toEqual({ checked: 1, ingested: 1, failed: 0, skipped_debounced: 0, degraded: false, reason: null });
    expect(gh.calls.filter((c) => c.method === 'downloadArtifact')).toHaveLength(1);

    const rows = await ciRuns();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      providerRunId: '1',
      status: 'succeeded',
      findingsCount: 4,
      critical: 1,
      verdict: 'request_changes',
      blockers: 1,
      costUsd: 0.05,
      durationMs: 2500,
      prNumber: 8,
      prTitle: 't',
      githubUrl: `https://github.com/${REPO}/actions/runs/1`,
      prUrl: `https://github.com/${REPO}/pull/8`,
      source: 'gha',
    });

    const agentRuns = await ciAgentRuns();
    expect(agentRuns).toHaveLength(1);
    expect(agentRuns[0]).toMatchObject({
      source: 'ci',
      prId: null,
      status: 'done',
      provider: 'openrouter',
      model: 'openai/gpt-4o',
      costUsd: 0.05,
      durationMs: 2500,
      findingsCount: 4,
      agentId,
    });
    expect(rows[0]!.agentRunId).toBe(agentRuns[0]!.id);
    const [tr] = await pg.handle.db.select().from(t.runTraces).where(eq(t.runTraces.runId, agentRuns[0]!.id));
    expect(RunTrace.parse(tr!.trace).config.source).toBe('ci');
    expect((tr!.trace as { log: unknown[] }).log).toEqual([]);

    const [inst] = await pg.handle.db.select().from(t.ciInstallations).where(eq(t.ciInstallations.id, installationId));
    expect(inst).toMatchObject({ state: 'active' });
    expect(inst!.lastRefreshedAt).not.toBeNull();
  });

  it('keeps one row per run id across refreshes and a second attempt, fields unchanged (AC-78, EC-22)', async () => {
    const before = await ciRuns();
    const gh = new MockGitHubClient({
      workflowRuns: [run(1), run(1, { run_attempt: 2, conclusion: 'success' })],
      artifacts: { 1: [art(11)] },
      artifactZips: { 11: zip({ ...result, findings_count: 99 }) },
    });
    const app = await mkApp(gh);
    await refresh(app);
    await refresh(app);
    const after = await ciRuns();
    expect(after).toHaveLength(1);
    expect(after[0]).toEqual(before[0]);
    expect(await ciAgentRuns()).toHaveLength(1);
  });

  it('stores failed rows with the reason and no counts, and ignores benign no-artifact runs (AC-77, AC-85, EC-25)', async () => {
    await reset();
    const gh = new MockGitHubClient({
      workflowRuns: [
        run(21, { conclusion: 'failure' }),
        run(22, { conclusion: 'success' }),
        run(23, { conclusion: 'skipped' }),
        run(24, { conclusion: 'cancelled' }),
        run(25, { repository_id: 1 }),
      ],
      artifacts: { 25: [art(35)] },
      artifactZips: { 35: zip(result) },
    });
    const app = await mkApp(gh);
    const out = CiRefreshResult.parse((await refresh(app)).json());
    expect(out).toMatchObject({ ingested: 0, failed: 2, degraded: false });

    const rows = await ciRuns();
    expect(rows.map((r) => r.providerRunId).sort()).toEqual(['21', '25']);
    expect(rows.find((r) => r.providerRunId === '21')).toMatchObject({ status: 'failed', failureReason: 'no result artifact', findingsCount: null, critical: null, costUsd: null });
    expect(rows.find((r) => r.providerRunId === '25')).toMatchObject({ status: 'failed', failureReason: 'repository mismatch', findingsCount: null });
    expect(await ciAgentRuns()).toHaveLength(0);
  });

  it('keeps counts when posting failed (EC-18)', async () => {
    await reset();
    const gh = new MockGitHubClient({
      workflowRuns: [run(31)],
      artifacts: { 31: [art(41)] },
      artifactZips: { 41: zip({ ...result, post_outcome: 'post_failed' }) },
    });
    const app = await mkApp(gh);
    await refresh(app);
    const [row] = await ciRuns();
    expect(row).toMatchObject({ status: 'failed', failureReason: 'posting to GitHub failed', findingsCount: 4, critical: 1 });
  });

  it('skips a non-forced refresh within 30 s with no GitHub calls (AC-74, NFR-5)', async () => {
    await reset();
    const gh = new MockGitHubClient({ workflowRuns: [run(51)], artifacts: { 51: [art(61)] }, artifactZips: { 61: zip(result) } });
    const app = await mkApp(gh);
    await refresh(app, true);
    gh.calls.length = 0;
    const out = CiRefreshResult.parse((await refresh(app, false)).json());
    expect(out).toMatchObject({ checked: 0, skipped_debounced: 1 });
    expect(gh.calls).toEqual([]);
  });

  it('persists merged and closed states (AC-58)', async () => {
    for (const [prState, expected] of [['merged', 'active'], ['closed', 'pr_closed']] as const) {
      await reset();
      const app = await mkApp(new MockGitHubClient({ prStates: { 3: prState } }));
      await refresh(app);
      const [inst] = await pg.handle.db.select().from(t.ciInstallations).where(eq(t.ciInstallations.id, installationId));
      expect(inst!.state).toBe(expected);
    }
  });

  it('degrades on a GitHub 5xx and keeps stored runs (EC-14)', async () => {
    await reset();
    const okApp = await mkApp(new MockGitHubClient({ workflowRuns: [run(71)], artifacts: { 71: [art(81)] }, artifactZips: { 81: zip(result) } }));
    await refresh(okApp);
    const before = await ciRuns();
    const bad = await mkApp(new MockGitHubClient({ workflowRuns: Object.assign(new Error('bad gateway'), { status: 502 }) }));
    const out = CiRefreshResult.parse((await refresh(bad)).json());
    expect(out).toMatchObject({ degraded: true, reason: 'GitHub is unavailable', ingested: 0 });
    expect(await ciRuns()).toEqual(before);
  });
});
