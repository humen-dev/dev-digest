/**
 * SPEC-05 eval cases (U11) over a real Postgres (Testcontainers) through the real
 * HTTP surface: create-from-finding (AC-1/2/4/8/10/13, EC-2), the frozen-input
 * path (single-file diff, secret placeholders), edit / delete / manual create
 * (AC-46…49, UT-7, UT-8) and workspace isolation (NFR-11, UT-11).
 * Gated on Docker like the other `*.it.test.ts` files.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { EvalCase, EvalCaseDetail, EvalCaseListItem } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { stubLlm } from './helpers/eval-fakes.js';
import { buildApp } from '../src/app.js';
import { loadConfig, type AppConfig } from '../src/platform/config.js';
import { MockAuthProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[eval-cases] Docker not available — skipping integration tests.');
}

const PATCH_A = '@@ -1,2 +1,4 @@\n a\n+b\n+c\n d';
const AWS_KEY = 'AKIA' + 'ABCDEFGHIJKLMNOP';
const PATCH_SECRET = `@@ -1,1 +1,3 @@\n a\n+const key = '${AWS_KEY}';\n+const ok = 1;`;

d('Eval cases (Testcontainers pg)', () => {
  let pg: PgFixture;
  let ws: string;
  let otherWs: string;
  let app: FastifyInstance;
  let otherApp: FastifyInstance;
  let seq = 0;

  const makeApp = (workspaceId: string) =>
    buildApp({
      config: { ...loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv), logLevel: 'silent' } as AppConfig,
      db: pg.handle.db,
      overrides: {
        auth: new MockAuthProvider(undefined, { id: workspaceId, name: 'ws' }),
        llm: { openai: stubLlm(() => ({ verdict: 'comment', summary: 's', score: 80, findings: [] })) },
      },
    });

  beforeAll(async () => {
    pg = await startPg();
    const db = pg.handle.db;
    [{ id: ws }, { id: otherWs }] = (await db
      .insert(t.workspaces)
      .values([{ name: 'cases-ws' }, { name: 'cases-other' }])
      .returning()) as [{ id: string }, { id: string }];
    app = await makeApp(ws);
    otherApp = await makeApp(otherWs);
  });
  afterAll(async () => {
    await app?.close();
    await otherApp?.close();
    await pg?.stop();
  });

  async function mkAgent(workspaceId = ws) {
    const [a] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId, name: `agent-${seq++}`, provider: 'openai', model: 'gpt-x', systemPrompt: 'be strict' })
      .returning();
    return a!.id;
  }

  /** A PR with `files` (path → patch), one review by `agentId`, one finding on `file:start-end`. */
  async function mkFinding(opts: {
    agentId: string | null;
    file?: string;
    start?: number;
    end?: number;
    accepted?: Date | null;
    dismissed?: Date | null;
    files?: Record<string, string | null>;
    workspaceId?: string;
  }) {
    const db = pg.handle.db;
    const workspaceId = opts.workspaceId ?? ws;
    const n = seq++;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: `cases-${n}`, fullName: `acme/cases-${n}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 700 + n,
        title: 'Add limiter',
        author: 'dev',
        branch: 'f',
        base: 'main',
        headSha: `sha-${n}`,
        body: 'PR body',
      })
      .returning();
    for (const [path, patch] of Object.entries(opts.files ?? { 'src/a.ts': PATCH_A })) {
      await db.insert(t.prFiles).values({ prId: pr!.id, path, additions: 2, deletions: 0, patch });
    }
    const [review] = await db
      .insert(t.reviews)
      .values({ workspaceId, prId: pr!.id, agentId: opts.agentId, kind: 'review' })
      .returning();
    const [f] = await db
      .insert(t.findings)
      .values({
        reviewId: review!.id,
        file: opts.file ?? 'src/a.ts',
        startLine: opts.start ?? 2,
        endLine: opts.end ?? 3,
        severity: 'WARNING',
        category: 'bug',
        title: 'Possible problem',
        rationale: 'why',
        confidence: 0.9,
        acceptedAt: opts.accepted ?? null,
        dismissedAt: opts.dismissed ?? null,
      })
      .returning();
    return f!.id;
  }

  const caseRows = (owner: string) => pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.ownerId, owner));
  const post = (a: FastifyInstance, id: string) => a.inject({ method: 'POST', url: `/findings/${id}/eval-case` });

  it('AC-1, AC-2, AC-10: a dismissed finding → 201 and one case; again → 200, same id; a later accept keeps the expectation', async () => {
    const agent = await mkAgent();
    const finding = await mkFinding({ agentId: agent, dismissed: new Date('2026-10-01T10:00:00Z') });

    const first = await post(app, finding);
    expect(first.statusCode, first.body).toBe(201);
    const c = EvalCase.parse(first.json());
    expect(c.owner_id).toBe(agent);
    expect(c.source_finding_id).toBe(finding);
    expect(c.expectation).toEqual({ type: 'must_not_flag', file: 'src/a.ts', start_line: 2, end_line: 3 });
    expect(await caseRows(agent)).toHaveLength(1);

    const second = await post(app, finding);
    expect(second.statusCode).toBe(200);
    expect(EvalCase.parse(second.json()).id).toBe(c.id);
    expect(await caseRows(agent)).toHaveLength(1);

    await pg.handle.db.update(t.findings).set({ acceptedAt: new Date('2026-10-02T10:00:00Z') }).where(eq(t.findings.id, finding));
    const third = await post(app, finding);
    expect(third.statusCode).toBe(200);
    expect(EvalCase.parse(third.json()).expectation.type).toBe('must_not_flag');
    expect((await caseRows(agent))[0]!.expectedOutput).toMatchObject({ type: 'must_not_flag' });
  });

  it('an accepted finding becomes a must_find case', async () => {
    const agent = await mkAgent();
    const finding = await mkFinding({ agentId: agent, accepted: new Date('2026-10-01T10:00:00Z') });
    const res = await post(app, finding);
    expect(res.statusCode).toBe(201);
    expect(EvalCase.parse(res.json()).expectation.type).toBe('must_find');
  });

  it('AC-4: an untriaged finding → 422 finding_not_triaged and no case', async () => {
    const agent = await mkAgent();
    const finding = await mkFinding({ agentId: agent });
    const res = await post(app, finding);
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('finding_not_triaged');
    expect(await caseRows(agent)).toHaveLength(0);
  });

  it('AC-8: lines outside every hunk → 422 expectation_outside_diff naming the file and range; no case', async () => {
    const agent = await mkAgent();
    const finding = await mkFinding({ agentId: agent, start: 50, end: 51, accepted: new Date() });
    const res = await post(app, finding);
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toMatchObject({
      code: 'expectation_outside_diff',
      details: { file: 'src/a.ts', start_line: 50, end_line: 51 },
    });
    expect(await caseRows(agent)).toHaveLength(0);
  });

  it('AC-13: a review without an agent → 422 agent_unavailable; no case', async () => {
    const finding = await mkFinding({ agentId: null, accepted: new Date() });
    const res = await post(app, finding);
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('agent_unavailable');
    expect(await pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.sourceFindingId, finding))).toHaveLength(0);
  });

  it('EC-2: a PR without patches → 422 diff_unavailable; no case', async () => {
    const agent = await mkAgent();
    const finding = await mkFinding({ agentId: agent, accepted: new Date(), files: { 'src/a.ts': null } });
    const res = await post(app, finding);
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('diff_unavailable');
    expect(await caseRows(agent)).toHaveLength(0);
  });

  it('the frozen input is the finding file only, with secret placeholders and no raw token', async () => {
    const agent = await mkAgent();
    const finding = await mkFinding({
      agentId: agent,
      file: 'src/secret.ts',
      start: 2,
      end: 2,
      accepted: new Date(),
      files: { 'src/a.ts': PATCH_A, 'src/secret.ts': PATCH_SECRET },
    });
    const res = await post(app, finding);
    expect(res.statusCode, res.body).toBe(201);
    const row = (await caseRows(agent))[0]!;
    expect(row.inputFiles).toEqual(['src/secret.ts']);
    expect(row.inputDiff).not.toContain('src/a.ts');
    expect(row.inputDiff).not.toContain(AWS_KEY);
    expect(row.inputDiff).toContain('AKIA');
    expect(row.inputDiff).toContain('const ok = 1;');
    expect(row.inputMeta).toMatchObject({ title: 'Add limiter', body: 'PR body' });
  });

  describe('edit, delete and manual create', () => {
    const manual = (over: Record<string, unknown> = {}) => ({
      name: 'manual case',
      input_diff: ['diff --git a/src/a.ts b/src/a.ts', '--- a/src/a.ts', '+++ b/src/a.ts', PATCH_A].join('\n'),
      pr_title: 'T',
      pr_body: null,
      expectation: { type: 'must_find', file: 'src/a.ts', start_line: 2, end_line: 2 },
      ...over,
    });

    it('AC-49: a hand-authored case → 201 owned by the agent with a null source finding; it is listed', async () => {
      const agent = await mkAgent();
      const res = await app.inject({ method: 'POST', url: `/agents/${agent}/eval-cases`, payload: manual() });
      expect(res.statusCode, res.body).toBe(201);
      const c = EvalCase.parse(res.json());
      expect(c).toMatchObject({ owner_id: agent, source_finding_id: null, name: 'manual case' });
      const list = (await app.inject({ method: 'GET', url: `/agents/${agent}/eval-cases` })).json();
      expect(list.map((x: { id: string }) => EvalCaseListItem.parse(x).id)).toEqual([c.id]);
    });

    it('I-5: a manual case gets the same masking and hunk rule as edit', async () => {
      const agent = await mkAgent();
      const secretDiff = ['diff --git a/s.ts b/s.ts', '--- a/s.ts', '+++ b/s.ts', PATCH_SECRET].join('\n');
      const ok = await app.inject({
        method: 'POST',
        url: `/agents/${agent}/eval-cases`,
        payload: manual({ input_diff: secretDiff, expectation: { type: 'must_find', file: 's.ts', start_line: 2, end_line: 2 } }),
      });
      expect(ok.statusCode, ok.body).toBe(201);
      expect((await caseRows(agent))[0]!.inputDiff).not.toContain(AWS_KEY);

      const outside = await app.inject({
        method: 'POST',
        url: `/agents/${agent}/eval-cases`,
        payload: manual({ expectation: { type: 'must_find', file: 'src/a.ts', start_line: 90, end_line: 91 } }),
      });
      expect(outside.statusCode).toBe(422);
      expect(outside.json().error.code).toBe('expectation_outside_diff');
      expect(await caseRows(agent)).toHaveLength(1);
    });

    it('AC-46, AC-47, UT-7: a valid PATCH is stored; an invalid or hostile expectation → 422 and the row is unchanged', async () => {
      const agent = await mkAgent();
      const c = EvalCase.parse((await app.inject({ method: 'POST', url: `/agents/${agent}/eval-cases`, payload: manual() })).json());
      const url = `/eval-cases/${c.id}`;

      const ok = await app.inject({
        method: 'PATCH',
        url,
        payload: { name: 'renamed', notes: 'n', expectation: { type: 'must_not_flag', file: 'src/a.ts', start_line: 3, end_line: 4 } },
      });
      expect(ok.statusCode, ok.body).toBe(200);
      expect(ok.json()).toMatchObject({ name: 'renamed', notes: 'n', expectation: { type: 'must_not_flag', start_line: 3, end_line: 4 } });
      const stored = (await caseRows(agent))[0]!;
      expect(stored.expectedOutput).toEqual({ type: 'must_not_flag', file: 'src/a.ts', start_line: 3, end_line: 4 });

      const bad = await app.inject({ method: 'PATCH', url, payload: { expectation: { type: 'maybe', file: 'src/a.ts', start_line: 1, end_line: 1 } } });
      expect(bad.statusCode).toBe(422);
      expect(JSON.stringify(bad.json().error.details)).toContain('type');

      const hostile: string[] = [
        '{"expectation":{"type":{"$gt":""},"file":"src/a.ts","start_line":1,"end_line":1}}',
        '{"expectation":{"type":"must_find","file":"src/a.ts","start_line":1,"end_line":1,"__proto__":{"polluted":true}}}',
        '{"expectation":{"type":"must_find","file":"src/a.ts","start_line":0,"end_line":1}}',
        '{"expectation":{"type":"must_find","file":"src/a.ts","start_line":5,"end_line":2}}',
        '{"expectation":{"type":"must_find","file":"","start_line":1,"end_line":1}}',
      ];
      for (const payload of hostile) {
        const res = await app.inject({ method: 'PATCH', url, headers: { 'content-type': 'application/json' }, payload });
        // Fastify's secure JSON parser refuses a `__proto__` key itself (400) before zod runs (422); both are rejections.
        expect(payload.includes('__proto__') ? [400, 422] : [422], payload).toContain(res.statusCode);
      }
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      const after = (await caseRows(agent))[0]!;
      expect(after.expectedOutput).toEqual(stored.expectedOutput);
      expect(after.updatedAt.getTime()).toBe(stored.updatedAt.getTime());
    });

    it('UT-8: a name over 120 characters or notes over 2000 → 422 naming the field', async () => {
      const agent = await mkAgent();
      const longName = await app.inject({ method: 'POST', url: `/agents/${agent}/eval-cases`, payload: manual({ name: 'n'.repeat(121) }) });
      expect(longName.statusCode).toBe(422);
      expect(JSON.stringify(longName.json().error.details)).toContain('name');
      const longNotes = await app.inject({ method: 'POST', url: `/agents/${agent}/eval-cases`, payload: manual({ notes: 'x'.repeat(2001) }) });
      expect(longNotes.statusCode).toBe(422);
      expect(JSON.stringify(longNotes.json().error.details)).toContain('notes');
      expect(await caseRows(agent)).toHaveLength(0);
    });

    it('AC-48: DELETE → 204 and the case is gone from the list', async () => {
      const agent = await mkAgent();
      const c = EvalCase.parse((await app.inject({ method: 'POST', url: `/agents/${agent}/eval-cases`, payload: manual() })).json());
      const del = await app.inject({ method: 'DELETE', url: `/eval-cases/${c.id}` });
      expect(del.statusCode).toBe(204);
      expect((await app.inject({ method: 'GET', url: `/agents/${agent}/eval-cases` })).json()).toEqual([]);
      expect((await app.inject({ method: 'GET', url: `/eval-cases/${c.id}` })).statusCode).toBe(404);
    });

    it('AC-16: a case whose source finding is gone reads as source_deleted', async () => {
      const agent = await mkAgent();
      const finding = await mkFinding({ agentId: agent, accepted: new Date() });
      const c = EvalCase.parse((await post(app, finding)).json());
      const before = EvalCaseDetail.parse((await app.inject({ method: 'GET', url: `/eval-cases/${c.id}` })).json());
      expect(before).toMatchObject({ source_deleted: false, source: { pr_number: expect.any(Number) } });
      await pg.handle.db.delete(t.findings).where(eq(t.findings.id, finding));
      const after = EvalCaseDetail.parse((await app.inject({ method: 'GET', url: `/eval-cases/${c.id}` })).json());
      expect(after).toMatchObject({ source: null, source_deleted: true });
    });
  });

  it('NFR-11, UT-11: another workspace gets 404 on every case route and nothing changes', async () => {
    const agent = await mkAgent();
    const finding = await mkFinding({ agentId: agent, accepted: new Date() });
    const c = EvalCase.parse((await post(app, finding)).json());
    const before = (await caseRows(agent))[0]!;

    expect((await post(otherApp, finding)).statusCode).toBe(404);
    expect((await otherApp.inject({ method: 'GET', url: `/eval-cases/${c.id}` })).statusCode).toBe(404);
    expect((await otherApp.inject({ method: 'GET', url: `/agents/${agent}/eval-cases` })).statusCode).toBe(404);
    expect((await otherApp.inject({ method: 'GET', url: `/agents/${agent}/eval-runs/estimate` })).statusCode).toBe(404);
    expect(
      (await otherApp.inject({ method: 'PATCH', url: `/eval-cases/${c.id}`, payload: { name: 'hijacked' } })).statusCode,
    ).toBe(404);
    expect((await otherApp.inject({ method: 'DELETE', url: `/eval-cases/${c.id}` })).statusCode).toBe(404);
    expect(
      (
        await otherApp.inject({
          method: 'POST',
          url: `/agents/${agent}/eval-cases`,
          payload: { name: 'x', input_diff: before.inputDiff, pr_title: 'T', pr_body: null, expectation: before.expectedOutput },
        })
      ).statusCode,
    ).toBe(404);

    const after = (await caseRows(agent))[0]!;
    expect(after).toEqual(before);
  });
});
