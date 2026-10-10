/**
 * Eval repository (SPEC-05, U5) over a real Postgres (Testcontainers). Gated on
 * Docker like the other `*.it.test.ts` files. Proves what only a real DB can:
 * agent-delete cascade (AC-75), the conflict paths of `insertCase` / `insertRun`
 * (AC-2, EC-4, AC-25, EC-5), heartbeat-based stale reconcile (AC-29), the
 * `WHERE status='running'` guards and workspace isolation (NFR-11, UT-11).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { EvalCaseOutcome, EvalRunMetrics } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import * as t from '../src/db/schema.js';
import { EvalRepository } from '../src/modules/eval/repository.js';
import type { NewCase } from '../src/modules/eval/ports.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[eval-repository] Docker not available — skipping integration tests.');
}

const METRICS: EvalRunMetrics = {
  recall: 1,
  precision: 0.5,
  citation_accuracy: 1,
  cases_passed: 1,
  cases_total: 1,
  cases_errored: 0,
  uncovered_findings: 0,
};

const OUTCOME: EvalCaseOutcome = {
  case_id: 'c1',
  name: 'case',
  expectation_type: 'must_find',
  status: 'scored',
  pass: true,
  error_reason: null,
  findings_total: 1,
  findings_matched: 1,
  grounding_kept: 1,
  grounding_total: 1,
  actual: [],
  duration_ms: 10,
  cost_usd: 0.01,
};

d('Eval repository (Testcontainers pg)', () => {
  let pg: PgFixture;
  let repo: EvalRepository;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    repo = new EvalRepository(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function mkWorkspace() {
    const [ws] = await pg.handle.db.insert(t.workspaces).values({ name: `ws-${seq++}` }).returning();
    return ws!.id;
  }

  async function mkAgent(ws: string, name = `agent-${seq++}`) {
    const [a] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId: ws, name, provider: 'openai', model: 'gpt-x', systemPrompt: 'be strict' })
      .returning();
    return a!.id;
  }

  function newCase(ws: string, owner: string, over: Partial<NewCase> = {}): NewCase {
    return {
      workspace_id: ws,
      owner_id: owner,
      name: `case-${seq++}`,
      notes: null,
      input_diff: 'diff --git a/a.ts b/a.ts\n@@ -1 +1 @@\n-a\n+b',
      input_files: ['a.ts'],
      input_meta: { pr_id: null, pr_number: null, title: 'T', body: null },
      expectation: { type: 'must_find', file: 'a.ts', start_line: 1, end_line: 1 },
      source_finding_id: null,
      severity: null,
      category: null,
      ...over,
    };
  }

  async function mkFinding(ws: string, agentId: string | null) {
    const db = pg.handle.db;
    const n = seq++;
    const [r] = await db
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name: `ev-${n}`, fullName: `acme/ev-${n}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws,
        repoId: r!.id,
        number: 500 + n,
        title: 'PR title',
        author: 'dev',
        branch: 'f',
        base: 'main',
        headSha: 'sha',
        body: 'PR body',
      })
      .returning();
    const [rev] = await db
      .insert(t.reviews)
      .values({ workspaceId: ws, prId: pr!.id, agentId, kind: 'review' })
      .returning();
    const [f] = await db
      .insert(t.findings)
      .values({
        reviewId: rev!.id,
        file: 'a.ts',
        startLine: 3,
        endLine: 4,
        severity: 'warning',
        category: 'bug',
        title: 'Bad',
        rationale: 'why',
        confidence: 0.9,
        acceptedAt: new Date(),
      })
      .returning();
    return { findingId: f!.id, repoId: r!.id, prNumber: pr!.number, prId: pr!.id };
  }

  it('findingSource / findingLink read the finding with its PR, scoped to the workspace', async () => {
    const ws = await mkWorkspace();
    const other = await mkWorkspace();
    const agent = await mkAgent(ws);
    const f = await mkFinding(ws, agent);
    const src = await repo.findingSource(ws, f.findingId);
    expect(src).toMatchObject({
      finding_id: f.findingId,
      file: 'a.ts',
      start_line: 3,
      end_line: 4,
      agent_id: agent,
      pr_id: f.prId,
      pr_title: 'PR title',
      pr_body: 'PR body',
      dismissed_at: null,
    });
    expect(src!.accepted_at).not.toBeNull();
    expect(await repo.findingLink(ws, f.findingId)).toEqual({ repo_id: f.repoId, pr_number: f.prNumber });
    expect(await repo.findingSource(other, f.findingId)).toBeNull();
    expect(await repo.findingLink(other, f.findingId)).toBeNull();
  });

  it('insertCase is idempotent per source finding: concurrent inserts give one row, created once (AC-2, EC-4)', async () => {
    const ws = await mkWorkspace();
    const agent = await mkAgent(ws);
    const { findingId } = await mkFinding(ws, agent);
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        repo.insertCase(newCase(ws, agent, { name: `race-${i}`, source_finding_id: findingId })),
      ),
    );
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(results.map((r) => r.case.id)).size).toBe(1);
    expect(await repo.countCases(ws, agent)).toBe(1);
    expect((await repo.caseBySourceFinding(ws, findingId))?.id).toBe(results[0]!.case.id);
  });

  it('cases without a source finding never conflict; CRUD round-trips the contract shape', async () => {
    const ws = await mkWorkspace();
    const agent = await mkAgent(ws);
    const a = await repo.insertCase(newCase(ws, agent, { name: 'one' }));
    const b = await repo.insertCase(newCase(ws, agent, { name: 'two' }));
    expect(a.created && b.created).toBe(true);
    expect(a.case).toMatchObject({
      owner_kind: 'agent',
      owner_id: agent,
      input_files: ['a.ts'],
      expectation: { type: 'must_find', file: 'a.ts', start_line: 1, end_line: 1 },
    });
    expect((await repo.caseNames(ws, agent)).sort()).toEqual(['one', 'two']);
    expect((await repo.listCases(ws, agent)).map((c) => c.name)).toEqual(['one', 'two']);

    const upd = await repo.updateCase(ws, a.case.id, { name: 'renamed', notes: 'n' });
    expect(upd).toMatchObject({ name: 'renamed', notes: 'n' });
    expect(upd!.updated_at >= a.case.updated_at).toBe(true);
    expect(await repo.getCase(ws, a.case.id)).toMatchObject({ name: 'renamed' });

    expect(await repo.deleteCase(ws, a.case.id)).toBe(true);
    expect(await repo.deleteCase(ws, a.case.id)).toBe(false);
    expect(await repo.countCases(ws, agent)).toBe(1);
  });

  it('deleting an agent removes its cases and runs (AC-75)', async () => {
    const ws = await mkWorkspace();
    const agent = await mkAgent(ws);
    await repo.insertCase(newCase(ws, agent));
    await repo.insertRun({ workspace_id: ws, owner_id: agent, agent_version: 1, skills_fingerprint: [], case_ids: [] });
    await pg.handle.db.delete(t.agents).where(eq(t.agents.id, agent));
    expect(await repo.countCases(ws, agent)).toBe(0);
    expect(await repo.listRuns(ws, agent)).toEqual([]);
  });

  it('a second insertRun while one is running returns null; allowed again after it ends (AC-25, EC-5)', async () => {
    const ws = await mkWorkspace();
    const agent = await mkAgent(ws);
    const run = { workspace_id: ws, owner_id: agent, agent_version: 1, skills_fingerprint: [], case_ids: ['x'] };
    const first = await repo.insertRun(run);
    expect(first).toEqual(expect.any(String));
    expect(await repo.insertRun(run)).toBeNull();
    const running = await repo.runningRun(ws, agent);
    expect(running).toMatchObject({ id: first, status: 'running', metrics: null, skills_delta: false });

    await repo.failRun(first!, 'boom');
    expect(await repo.runningRun(ws, agent)).toBeNull();
    expect(await repo.insertRun(run)).toEqual(expect.any(String));
  });

  it('completeRun stores metrics and per_case; list queries omit per_case; complete/fail ignore non-running rows', async () => {
    const ws = await mkWorkspace();
    const agent = await mkAgent(ws, 'Reviewer');
    const id = (await repo.insertRun({
      workspace_id: ws,
      owner_id: agent,
      agent_version: 2,
      skills_fingerprint: [{ skill_id: 's', name: 'S', version: 3 }],
      case_ids: ['c1'],
    }))!;
    await repo.heartbeat(id);
    await repo.completeRun(id, { metrics: METRICS, per_case: [OUTCOME], duration_ms: 1234, cost_usd: 0.02 });

    const detail = await repo.getRun(ws, id);
    expect(detail).toMatchObject({
      id,
      agent_id: agent,
      agent_name: 'Reviewer',
      agent_version: 2,
      status: 'completed',
      duration_ms: 1234,
      cost_usd: 0.02,
      skills_fingerprint: [{ skill_id: 's', name: 'S', version: 3 }],
      case_ids: ['c1'],
      metrics: METRICS,
      per_case: [OUTCOME],
    });
    expect(detail!.finished_at).not.toBeNull();

    // A late failure or a second completion must not overwrite a finished row.
    await repo.failRun(id, 'late');
    await repo.completeRun(id, { metrics: { ...METRICS, recall: 0 }, per_case: [], duration_ms: 1, cost_usd: null });
    const after = await repo.getRun(ws, id);
    expect(after).toMatchObject({ status: 'completed', error_reason: null, metrics: METRICS });

    const listed = await repo.listRuns(ws, agent);
    expect(listed).toHaveLength(1);
    expect(listed[0]).not.toHaveProperty('per_case');
    expect(listed[0]).toMatchObject({ id, agent_name: 'Reviewer', metrics: METRICS });
    const recent = await repo.recentRuns(ws, 5);
    expect(recent.map((r) => r.id)).toContain(id);
    expect(recent[0]).not.toHaveProperty('per_case');

    expect(await repo.completedOutcomes(ws, agent, 5)).toEqual([{ run_id: id, per_case: [OUTCOME] }]);
    expect(await repo.runExists(id)).toBe(true);
    expect(await repo.runExists('00000000-0000-0000-0000-000000000000')).toBe(false);
  });

  it('listRuns is newest first', async () => {
    const ws = await mkWorkspace();
    const agent = await mkAgent(ws);
    const mk = async () =>
      (await repo.insertRun({ workspace_id: ws, owner_id: agent, agent_version: 1, skills_fingerprint: [], case_ids: [] }))!;
    const older = await mk();
    await repo.failRun(older, 'x');
    await pg.handle.db
      .update(t.evalRuns)
      .set({ ranAt: new Date(Date.now() - 60_000) })
      .where(eq(t.evalRuns.id, older));
    const newer = await mk();
    expect((await repo.listRuns(ws, agent)).map((r) => r.id)).toEqual([newer, older]);
  });

  it('latestCompletedRuns keeps the newest N completed runs per agent, no per_case, workspace-scoped', async () => {
    const ws = await mkWorkspace();
    const other = await mkWorkspace();
    const a1 = await mkAgent(ws);
    const a2 = await mkAgent(ws);
    const mkDone = async (agent: string, minutesAgo: number) => {
      const id = (await repo.insertRun({ workspace_id: ws, owner_id: agent, agent_version: 1, skills_fingerprint: [], case_ids: [] }))!;
      await repo.completeRun(id, { metrics: METRICS, per_case: [OUTCOME], duration_ms: 1, cost_usd: null });
      await pg.handle.db.update(t.evalRuns).set({ ranAt: new Date(Date.now() - minutesAgo * 60_000) }).where(eq(t.evalRuns.id, id));
      return id;
    };
    const a1Runs = [await mkDone(a1, 30), await mkDone(a1, 20), await mkDone(a1, 10)]; // oldest first
    const a2Runs = [await mkDone(a2, 5)];
    // a non-completed run never counts toward the window
    const failed = (await repo.insertRun({ workspace_id: ws, owner_id: a2, agent_version: 1, skills_fingerprint: [], case_ids: [] }))!;
    await repo.failRun(failed, 'x');

    const got = await repo.latestCompletedRuns(ws, [a1, a2], 2);
    expect(got.filter((r) => r.agent_id === a1).map((r) => r.id)).toEqual([a1Runs[2], a1Runs[1]]);
    expect(got.filter((r) => r.agent_id === a2).map((r) => r.id)).toEqual(a2Runs);
    expect(got.every((r) => r.status === 'completed')).toBe(true);
    expect(got[0]).not.toHaveProperty('per_case');
    expect(got[0]).toMatchObject({ metrics: METRICS });

    expect(await repo.latestCompletedRuns(other, [a1, a2], 2)).toEqual([]);
    expect(await repo.latestCompletedRuns(ws, [], 2)).toEqual([]);
    expect(await repo.listRuns(ws, a1, 2)).toHaveLength(2);
  });

  it('reconcileStale errors only running runs whose heartbeat is older than the cutoff (AC-29, OQ-1)', async () => {
    const ws = await mkWorkspace();
    const a1 = await mkAgent(ws);
    const a2 = await mkAgent(ws);
    const a3 = await mkAgent(ws);
    const mk = async (agent: string) =>
      (await repo.insertRun({ workspace_id: ws, owner_id: agent, agent_version: 1, skills_fingerprint: [], case_ids: [] }))!;
    const stale = await mk(a1);
    const fresh = await mk(a2);
    const done = await mk(a3);
    await repo.completeRun(done, { metrics: METRICS, per_case: [], duration_ms: 1, cost_usd: null });
    const old = new Date(Date.now() - 16 * 60_000);
    // Started long ago but heartbeat is recent: a live long run must survive.
    await pg.handle.db.update(t.evalRuns).set({ ranAt: old }).where(eq(t.evalRuns.id, fresh));
    await pg.handle.db.update(t.evalRuns).set({ heartbeatAt: old }).where(eq(t.evalRuns.id, stale));
    await pg.handle.db.update(t.evalRuns).set({ heartbeatAt: old }).where(eq(t.evalRuns.id, done));

    expect(await repo.reconcileStale(new Date(Date.now() - 15 * 60_000), ws)).toBe(1);
    expect(await repo.getRun(ws, stale)).toMatchObject({ status: 'errored', error_reason: 'interrupted' });
    expect((await repo.getRun(ws, stale))!.finished_at).not.toBeNull();
    expect((await repo.getRun(ws, fresh))!.status).toBe('running');
    expect((await repo.getRun(ws, done))!.status).toBe('completed');
    // Idempotent.
    expect(await repo.reconcileStale(new Date(Date.now() - 15 * 60_000), ws)).toBe(0);
  });

  it('reconcileStale without a workspace covers every workspace', async () => {
    const ws = await mkWorkspace();
    const agent = await mkAgent(ws);
    const id = (await repo.insertRun({ workspace_id: ws, owner_id: agent, agent_version: 1, skills_fingerprint: [], case_ids: [] }))!;
    await pg.handle.db
      .update(t.evalRuns)
      .set({ heartbeatAt: new Date(Date.now() - 3_600_000) })
      .where(eq(t.evalRuns.id, id));
    expect(await repo.reconcileStale(new Date(Date.now() - 15 * 60_000))).toBeGreaterThanOrEqual(1);
    expect((await repo.getRun(ws, id))!.status).toBe('errored');
  });

  it('agentSnapshot returns the agent with its skills in link order; agentSystemPrompt reads the version config', async () => {
    const ws = await mkWorkspace();
    const agent = await mkAgent(ws, 'Snap');
    const mkSkill = async (name: string, enabled: boolean, version: number) => {
      const [s] = await pg.handle.db
        .insert(t.skills)
        .values({ workspaceId: ws, name, description: '', type: 'rubric', source: 'manual', body: `${name} body`, enabled, version })
        .returning();
      return s!.id;
    };
    const s1 = await mkSkill('Zeta', true, 2);
    const s2 = await mkSkill('Alpha', false, 1);
    await pg.handle.db.insert(t.agentSkills).values([
      { agentId: agent, skillId: s1, order: 0 },
      { agentId: agent, skillId: s2, order: 1 },
    ]);
    await pg.handle.db
      .insert(t.agentVersions)
      .values({ agentId: agent, version: 1, configJson: { system_prompt: 'v1 prompt' } });

    const snap = await repo.agentSnapshot(ws, agent);
    expect(snap).toMatchObject({
      agent_id: agent,
      name: 'Snap',
      provider: 'openai',
      model: 'gpt-x',
      system_prompt: 'be strict',
      strategy: 'single-pass',
      version: 1,
    });
    expect(snap!.skills.map((s) => [s.skill_id, s.enabled, s.version])).toEqual([
      [s1, true, 2],
      [s2, false, 1],
    ]);
    expect(await repo.agentSystemPrompt(agent, 1)).toBe('v1 prompt');
    expect(await repo.agentSystemPrompt(agent, 9)).toBeNull();
    expect(await repo.agentSnapshot(await mkWorkspace(), agent)).toBeNull();
  });

  it('agentsWithCases lists only agents that have cases, with counts', async () => {
    const ws = await mkWorkspace();
    const withCases = await mkAgent(ws, 'With');
    await mkAgent(ws, 'Without');
    await repo.insertCase(newCase(ws, withCases));
    await repo.insertCase(newCase(ws, withCases));
    expect(await repo.agentsWithCases(ws)).toEqual([
      { agent_id: withCases, name: 'With', model: 'gpt-x', cases_total: 2 },
    ]);
  });

  it('every method returns null / empty for another workspace (NFR-11, UT-11)', async () => {
    const ws = await mkWorkspace();
    const other = await mkWorkspace();
    const agent = await mkAgent(ws);
    const { findingId } = await mkFinding(ws, agent);
    const c = await repo.insertCase(newCase(ws, agent, { source_finding_id: findingId }));
    const runId = (await repo.insertRun({ workspace_id: ws, owner_id: agent, agent_version: 1, skills_fingerprint: [], case_ids: [] }))!;
    await repo.completeRun(runId, { metrics: METRICS, per_case: [OUTCOME], duration_ms: 1, cost_usd: null });

    expect(await repo.caseBySourceFinding(other, findingId)).toBeNull();
    expect(await repo.caseNames(other, agent)).toEqual([]);
    expect(await repo.getCase(other, c.case.id)).toBeNull();
    expect(await repo.listCases(other, agent)).toEqual([]);
    expect(await repo.countCases(other, agent)).toBe(0);
    expect(await repo.updateCase(other, c.case.id, { name: 'hijack' })).toBeNull();
    expect(await repo.deleteCase(other, c.case.id)).toBe(false);
    expect(await repo.getCase(ws, c.case.id)).toMatchObject({ name: c.case.name });
    expect(await repo.agentsWithCases(other)).toEqual([]);
    expect(await repo.runningRun(other, agent)).toBeNull();
    expect(await repo.getRun(other, runId)).toBeNull();
    expect(await repo.listRuns(other, agent)).toEqual([]);
    expect(await repo.latestCompletedRuns(other, [agent], 5)).toEqual([]);
    expect((await repo.recentRuns(other, 10)).map((r) => r.id)).not.toContain(runId);
    expect(await repo.completedOutcomes(other, agent, 10)).toEqual([]);
  });
});
