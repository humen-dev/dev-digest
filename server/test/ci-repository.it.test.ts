/**
 * SPEC-08 `DrizzleCiRepository` over a real Postgres (Testcontainers): upsert
 * semantics (slug kept), idempotent run claims, reader filters, orphaned runs.
 * Gated on Docker like the other `*.it.test.ts` files.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import * as t from '../src/db/schema.js';
import { DrizzleCiRepository } from '../src/modules/ci/repository.js';
import type { NewCiRunInput, UpsertInstallationInput } from '../src/modules/ci/ports.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[ci-repository] Docker not available — skipping integration tests.');
}

d('DrizzleCiRepository (Testcontainers pg)', () => {
  let pg: PgFixture;
  let repo: DrizzleCiRepository;
  let ws: string;
  let otherWs: string;
  let agentId: string;

  beforeAll(async () => {
    pg = await startPg();
    repo = new DrizzleCiRepository(pg.handle.db);
    const [w1, w2] = await pg.handle.db
      .insert(t.workspaces)
      .values([{ name: 'ci-ws' }, { name: 'ci-other' }])
      .returning();
    ws = w1!.id;
    otherWs = w2!.id;
    agentId = await mkAgent('Reviewer');
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function mkAgent(name: string): Promise<string> {
    const [a] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId: ws, name, provider: 'openrouter', model: 'm', systemPrompt: 'p' })
      .returning();
    return a!.id;
  }

  const upsertInput = (over: Partial<UpsertInstallationInput> = {}): UpsertInstallationInput => ({
    workspaceId: ws,
    agentId,
    repo: 'acme/upsert',
    targetType: 'gha',
    githubRepoId: 42,
    manifestSlug: 'reviewer',
    triggers: ['opened', 'synchronize'],
    postAs: 'github_review',
    workflowVersion: 'abcdef012345',
    generatorVersion: 1,
    agentVersion: 1,
    exportedCiFailOn: 'critical',
    prUrl: 'https://github.com/acme/upsert/pull/1',
    state: 'pr_open',
    ...over,
  });

  const runInput = (over: Partial<NewCiRunInput> = {}): NewCiRunInput => ({
    workspaceId: ws,
    ciInstallationId: null,
    agentId,
    repo: 'acme/runs',
    providerRunId: '1001',
    prNumber: 7,
    prTitle: 'Fix',
    prUrl: null,
    commitSha: 'a'.repeat(40),
    agentName: 'Reviewer',
    ranAt: new Date('2026-10-10T10:00:00Z'),
    status: 'succeeded',
    findingsCount: 2,
    critical: 1,
    warning: 1,
    suggestion: 0,
    verdict: 'comment',
    blockers: 1,
    costUsd: 0.01,
    durationMs: 1234,
    jobUrl: 'https://github.com/acme/runs/actions/runs/1001',
    failureReason: null,
    ingestedAt: new Date('2026-10-10T10:05:00Z'),
    ...over,
  });

  it('inserts, then updates in place and keeps the manifest slug (AC-39, AC-86)', async () => {
    const first = await repo.upsertInstallation(upsertInput());
    expect(first.created).toBe(true);
    expect(first.record).toMatchObject({ githubRepoId: 42, manifestSlug: 'reviewer', updatedAt: null });

    const second = await repo.upsertInstallation(
      upsertInput({ manifestSlug: 'renamed', triggers: ['opened'], agentVersion: 2, prUrl: 'https://x/2' }),
    );
    expect(second.created).toBe(false);
    expect(second.record.id).toBe(first.record.id);
    expect(second.record).toMatchObject({
      manifestSlug: 'reviewer',
      triggers: ['opened'],
      agentVersion: 2,
      prUrl: 'https://x/2',
    });
    expect(second.record.updatedAt).toBeInstanceOf(Date);
    expect(await repo.listInstallations(ws)).toHaveLength(1);
    expect(await repo.findInstallationByRepo(otherWs, 'acme/upsert')).toBeUndefined();
  });

  it('filters installations by agent and updates state / refresh time', async () => {
    const other = await mkAgent('Second');
    await repo.upsertInstallation(upsertInput({ repo: 'acme/second', agentId: other }));
    expect((await repo.listInstallations(ws, other)).map((r) => r.repo)).toEqual(['acme/second']);
    const rec = (await repo.findInstallationByRepo(ws, 'acme/second'))!;
    const at = new Date('2026-10-11T00:00:00Z');
    await repo.setInstallationState(rec.id, 'active');
    await repo.touchRefreshed(rec.id, at);
    expect(await repo.findInstallationByRepo(ws, 'acme/second')).toMatchObject({
      state: 'active',
      lastRefreshedAt: at,
    });
  });

  it('reads only repo-scoped memory of the given repository, in a stable order', async () => {
    const [r] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name: 'mem', fullName: 'acme/mem' })
      .returning();
    await pg.handle.db.insert(t.memory).values([
      { workspaceId: ws, repoId: r!.id, scope: 'repo', kind: 'decision', content: 'one' },
      { workspaceId: ws, repoId: r!.id, scope: 'repo', kind: 'fact', content: 'two' },
      { workspaceId: ws, repoId: r!.id, scope: 'global', kind: 'fact', content: 'not repo scope' },
    ]);
    const rows = await repo.memoryForRepo(ws, r!.id);
    expect(rows.map((m) => m.content).sort()).toEqual(['one', 'two']);
    expect(await repo.memoryForRepo(otherWs, r!.id)).toEqual([]);
  });

  it('claims a run once per provider run id (AC-78)', async () => {
    expect(await repo.hasRun(ws, '2001')).toBe(false);
    const id = await repo.claimRun(runInput({ providerRunId: '2001' }));
    expect(id).toEqual(expect.any(String));
    expect(await repo.claimRun(runInput({ providerRunId: '2001', findingsCount: 99 }))).toBeNull();
    expect(await repo.hasRun(ws, '2001')).toBe(true);
    expect(await repo.hasRun(otherWs, '2001')).toBe(false);
    // the same id in another workspace is a separate row
    expect(await repo.claimRun(runInput({ workspaceId: otherWs, agentId: null, providerRunId: '2001' }))).not.toBeNull();
  });

  it('links an agent run to a claimed ci run', async () => {
    const ciRunId = (await repo.claimRun(runInput({ providerRunId: '2002' })))!;
    const [ar] = await pg.handle.db
      .insert(t.agentRuns)
      .values({ workspaceId: ws, agentId, source: 'ci', status: 'done' })
      .returning();
    await repo.linkAgentRun(ciRunId, ar!.id);
    const [row] = await pg.handle.db.select().from(t.ciRuns).where(eq(t.ciRuns.id, ciRunId));
    expect(row!.agentRunId).toBe(ar!.id);
  });

  it('lists runs newest first with filters, limit and vocabularies (AC-28)', async () => {
    const agent = await mkAgent('Lister');
    const base = { agentId: agent, repo: 'acme/list' };
    await repo.claimRun(runInput({ ...base, providerRunId: '3001', ranAt: new Date('2026-10-01T00:00:00Z') }));
    await repo.claimRun(
      runInput({ ...base, providerRunId: '3002', ranAt: new Date('2026-10-05T00:00:00Z'), status: 'failed' }),
    );
    await repo.claimRun(runInput({ ...base, providerRunId: '3003', ranAt: new Date('2026-10-09T00:00:00Z') }));

    const all = await repo.listRuns(ws, { agent_id: agent, limit: 100 });
    expect(all.runs.map((r) => r.provider_run_id)).toEqual(['3003', '3002', '3001']);
    expect(all.runs[0]).toMatchObject({ repo: 'acme/list', source: 'gha', verdict: 'comment', job_url: expect.any(String) });
    expect(all.agents).toContainEqual({ id: agent, name: 'Lister' });
    expect(all.repos).toContain('acme/list');

    const failed = await repo.listRuns(ws, { agent_id: agent, status: 'failed', limit: 100 });
    expect(failed.runs.map((r) => r.provider_run_id)).toEqual(['3002']);
    const ranged = await repo.listRuns(ws, {
      agent_id: agent,
      from: '2026-10-02T00:00:00.000Z',
      to: '2026-10-08T00:00:00.000Z',
      limit: 100,
    });
    expect(ranged.runs.map((r) => r.provider_run_id)).toEqual(['3002']);
    expect((await repo.listRuns(ws, { agent_id: agent, limit: 1 })).runs).toHaveLength(1);
    expect((await repo.listRuns(ws, { repo: 'acme/list', source: 'gha', limit: 100 })).runs).toHaveLength(3);
    expect((await repo.listRuns(otherWs, { agent_id: agent, limit: 100 })).runs).toEqual([]);
  });

  it('hides rows that lack a provider run id', async () => {
    await pg.handle.db.insert(t.ciRuns).values({ workspaceId: ws, repo: 'acme/legacy', status: 'succeeded', ranAt: new Date() });
    const page = await repo.listRuns(ws, { repo: 'acme/legacy', limit: 100 });
    expect(page.runs).toEqual([]);
  });

  it('keeps the stored agent name after the agent is deleted (EC-20)', async () => {
    const doomed = await mkAgent('Doomed');
    await repo.claimRun(runInput({ agentId: doomed, agentName: 'Doomed', repo: 'acme/orphan', providerRunId: '4001' }));
    await pg.handle.db.delete(t.agents).where(eq(t.agents.id, doomed));
    const page = await repo.listRuns(ws, { repo: 'acme/orphan', limit: 100 });
    expect(page.runs).toHaveLength(1);
    expect(page.runs[0]).toMatchObject({ agent_id: null, agent_name: 'Doomed', repo: 'acme/orphan' });
  });

  it('returns the latest run per installation', async () => {
    const a = await mkAgent('Latest');
    const { record } = await repo.upsertInstallation(upsertInput({ repo: 'acme/latest', agentId: a }));
    const idle = await repo.upsertInstallation(upsertInput({ repo: 'acme/idle', agentId: a }));
    const base = { ciInstallationId: record.id, agentId: a, repo: 'acme/latest' };
    await repo.claimRun(runInput({ ...base, providerRunId: '5001', ranAt: new Date('2026-10-01T00:00:00Z'), status: 'failed', verdict: null }));
    await repo.claimRun(runInput({ ...base, providerRunId: '5002', ranAt: new Date('2026-10-03T00:00:00Z'), status: 'no_findings', verdict: 'approve' }));
    const map = await repo.lastRuns(ws, [record.id, idle.record.id]);
    expect(map.get(record.id)).toEqual({ status: 'no_findings', verdict: 'approve', ran_at: '2026-10-03T00:00:00.000Z' });
    expect(map.has(idle.record.id)).toBe(false);
    expect((await repo.lastRuns(ws, [])).size).toBe(0);
  });

  it('lists agent names of the workspace only', async () => {
    const names = (await repo.agentNames(ws)).map((a) => a.name);
    expect(names).toContain('Reviewer');
    expect(await repo.agentNames(otherWs)).toEqual([]);
  });
});
