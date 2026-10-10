/**
 * SPEC-06 over a real Postgres (Testcontainers): the unsaved case draft
 * (`GET /findings/:id/eval-case-draft`), saving the edited draft
 * (`POST /findings/:id/eval-case`) and the Run case dry run
 * (`POST /agents/:id/eval-cases/run`). Gated on Docker like the other `*.it.test.ts` files.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, count } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { EvalCase, EvalCaseDraftResponse, EvalCaseRunResult, type EvalCaseDraft } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { REVIEW_ON_A2, stubLlm, type StubLlm } from './helpers/eval-fakes.js';
import { buildApp } from '../src/app.js';
import { loadConfig, type AppConfig } from '../src/platform/config.js';
import { MockAuthProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[eval-case-draft] Docker not available — skipping integration tests.');
}

const PATCH_A = '@@ -1,2 +1,4 @@\n a\n+b\n+c\n d';
const TOKEN = `ghp_${'a1B2'.repeat(9)}`;
const PEM_BODY = 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASC';
const PATCH_SECRET = `@@ -1,1 +1,5 @@\n a\n+const t = '${TOKEN}';\n+-----BEGIN ${'RSA PRIVATE'} KEY-----\n+${PEM_BODY}\n+-----END ${'RSA PRIVATE'} KEY-----`;

d('Eval case draft, save and Run case (Testcontainers pg)', () => {
  let pg: PgFixture;
  let ws: string;
  let app: FastifyInstance;
  let llm: StubLlm;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    [{ id: ws }] = (await pg.handle.db.insert(t.workspaces).values([{ name: 'draft-ws' }]).returning()) as [{ id: string }];
    llm = stubLlm(() => REVIEW_ON_A2);
    app = await buildApp({
      config: { ...loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv), logLevel: 'silent' } as AppConfig,
      db: pg.handle.db,
      overrides: { auth: new MockAuthProvider(undefined, { id: ws, name: 'ws' }), llm: { openai: llm } },
    });
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  async function mkAgent() {
    const [a] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId: ws, name: `agent-${seq++}`, provider: 'openai', model: 'gpt-x', systemPrompt: 'be strict' })
      .returning();
    return a!.id;
  }

  async function mkFinding(opts: {
    agentId: string | null;
    file?: string;
    start?: number;
    end?: number;
    accepted?: Date | null;
    dismissed?: Date | null;
    files?: Record<string, string | null>;
    title?: string;
    prTitle?: string;
  }) {
    const db = pg.handle.db;
    const n = seq++;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name: `draft-${n}`, fullName: `acme/draft-${n}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws,
        repoId: repo!.id,
        number: 800 + n,
        title: opts.prTitle ?? 'Add limiter',
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
    const [review] = await db.insert(t.reviews).values({ workspaceId: ws, prId: pr!.id, agentId: opts.agentId, kind: 'review' }).returning();
    const [f] = await db
      .insert(t.findings)
      .values({
        reviewId: review!.id,
        file: opts.file ?? 'src/a.ts',
        startLine: opts.start ?? 2,
        endLine: opts.end ?? 3,
        severity: 'WARNING',
        category: 'bug',
        title: opts.title ?? 'Possible problem',
        rationale: 'why',
        confidence: 0.9,
        acceptedAt: opts.accepted ?? null,
        dismissedAt: opts.dismissed ?? null,
      })
      .returning();
    return f!.id;
  }

  const caseRows = (owner: string) => pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.ownerId, owner));
  const draftUrl = (id: string) => `/findings/${id}/eval-case-draft`;
  const getDraft = (id: string) => app.inject({ method: 'GET', url: draftUrl(id) });
  const bodyOf = (dr: EvalCaseDraft, over: Record<string, unknown> = {}) => ({
    name: dr.name,
    input_diff: dr.input_diff,
    pr_title: dr.input_meta.title,
    pr_body: dr.input_meta.body,
    expectation: dr.expectation,
    ...over,
  });
  const draftOf = async (id: string): Promise<EvalCaseDraft> => {
    const res = await getDraft(id);
    expect(res.statusCode, res.body).toBe(200);
    const parsed = EvalCaseDraftResponse.parse(res.json());
    if (parsed.kind !== 'draft') throw new Error('expected a draft');
    return parsed.draft;
  };
  const save = (id: string, payload: unknown) => app.inject({ method: 'POST', url: `/findings/${id}/eval-case`, payload: payload as object });

  describe('draft', () => {
    it('AC-1, AC-5, AC-6, AC-7, NFR-15: dismissed → must_not_flag, accepted → must_find, the finding file only; 0 rows, 0 provider calls', async () => {
      const agent = await mkAgent();
      const calls = llm.calls.length;
      const dismissed = await mkFinding({ agentId: agent, dismissed: new Date('2026-10-01T10:00:00Z'), files: { 'src/a.ts': PATCH_A, 'src/other.ts': PATCH_A } });
      const a = await draftOf(dismissed);
      expect(a.expectation).toEqual({ type: 'must_not_flag', file: 'src/a.ts', start_line: 2, end_line: 3 });
      expect(a).toMatchObject({ agent_id: agent, source_finding_id: dismissed, severity: 'WARNING', category: 'bug' });
      expect(a.input_files).toEqual(['src/a.ts']);
      expect(a.input_diff).not.toContain('other.ts');
      expect(a.input_meta).toMatchObject({ title: 'Add limiter', body: 'PR body' });

      const accepted = await mkFinding({ agentId: agent, accepted: new Date('2026-10-01T10:00:00Z') });
      expect((await draftOf(accepted)).expectation.type).toBe('must_find');

      expect(await caseRows(agent)).toHaveLength(0);
      expect(llm.calls.length).toBe(calls);
    });

    it('AC-2: a finding that already has a case → existing_case with its id and owner', async () => {
      const agent = await mkAgent();
      const finding = await mkFinding({ agentId: agent, accepted: new Date() });
      const saved = EvalCase.parse((await save(finding, bodyOf(await draftOf(finding)))).json());
      const res = EvalCaseDraftResponse.parse((await getDraft(finding)).json());
      expect(res).toEqual({ kind: 'existing_case', case_id: saved.id, owner_id: agent });
    });

    it('AC-4, AC-8, AC-9, AC-13, EC-2: untriaged, out-of-hunk, oversize, no agent, no patch → 422 with the code; 0 rows', async () => {
      const agent = await mkAgent();
      const untriaged = await getDraft(await mkFinding({ agentId: agent }));
      expect([untriaged.statusCode, untriaged.json().error.code]).toEqual([422, 'finding_not_triaged']);

      const outside = await getDraft(await mkFinding({ agentId: agent, start: 50, end: 51, accepted: new Date() }));
      expect(outside.statusCode).toBe(422);
      expect(outside.json().error).toMatchObject({ code: 'expectation_outside_diff', details: { file: 'src/a.ts', start_line: 50, end_line: 51 } });

      const huge = `@@ -1,1 +1,2 @@\n a\n+${'x'.repeat(210_000)}`;
      const big = await getDraft(await mkFinding({ agentId: agent, start: 2, end: 2, accepted: new Date(), files: { 'src/a.ts': huge } }));
      expect(big.statusCode).toBe(422);
      expect(big.json().error).toMatchObject({ code: 'frozen_input_too_large', details: { limit: 204_800 } });

      const noAgent = await getDraft(await mkFinding({ agentId: null, accepted: new Date() }));
      expect([noAgent.statusCode, noAgent.json().error.code]).toEqual([422, 'agent_unavailable']);

      const noPatch = await getDraft(await mkFinding({ agentId: agent, accepted: new Date(), files: { 'src/a.ts': null } }));
      expect([noPatch.statusCode, noPatch.json().error.code]).toEqual([422, 'diff_unavailable']);

      expect(await caseRows(agent)).toHaveLength(0);
    });

    it('AC-11: the name is a slug, gets a -2 suffix against the agent’s names, and is at most 120 characters', async () => {
      const agent = await mkAgent();
      const first = await mkFinding({ agentId: agent, accepted: new Date(), title: 'Missing null check' });
      const dr = await draftOf(first);
      expect(dr.name).toBe('missing-null-check');
      expect((await save(first, bodyOf(dr))).statusCode).toBe(201);
      const second = await mkFinding({ agentId: agent, accepted: new Date(), title: 'Missing null check' });
      expect((await draftOf(second)).name).toBe('missing-null-check-2');
      const long = await mkFinding({ agentId: agent, accepted: new Date(), title: 'Word '.repeat(80) });
      expect((await draftOf(long)).name.length).toBeLessThanOrEqual(120);
    });

    it('AC-14, AC-14a: a token and a PEM block are masked in the draft', async () => {
      const agent = await mkAgent();
      const finding = await mkFinding({
        agentId: agent,
        file: 'src/s.ts',
        start: 2,
        end: 2,
        accepted: new Date(),
        files: { 'src/s.ts': PATCH_SECRET },
        prTitle: `use ${TOKEN}`,
      });
      const dr = await draftOf(finding);
      const text = JSON.stringify(dr);
      expect(text).not.toContain(TOKEN);
      expect(text).not.toContain(PEM_BODY);
      expect(dr.input_diff).toContain('ghp_XXXX');
    });

    it('EC-29 / NFR-11: an unknown finding → 404', async () => {
      expect((await getDraft('00000000-0000-4000-8000-000000000000')).statusCode).toBe(404);
    });
  });

  describe('save', () => {
    it('AC-91, AC-92, EC-4: an edited draft is stored with the source finding; two saves → 201 then 200, one row', async () => {
      const agent = await mkAgent();
      const finding = await mkFinding({ agentId: agent, accepted: new Date() });
      const dr = await draftOf(finding);
      const calls = llm.calls.length;
      const first = await save(finding, bodyOf(dr, { name: 'edited name', notes: 'because', pr_title: 'Edited title', expectation: { ...dr.expectation, end_line: 2 } }));
      expect(first.statusCode, first.body).toBe(201);
      const c = EvalCase.parse(first.json());
      expect(c).toMatchObject({ owner_id: agent, source_finding_id: finding, name: 'edited name', notes: 'because', severity: 'WARNING', category: 'bug' });
      expect(c.expectation).toEqual({ type: 'must_find', file: 'src/a.ts', start_line: 2, end_line: 2 });
      expect(c.input_meta).toMatchObject({ title: 'Edited title', body: 'PR body' });

      const again = await save(finding, bodyOf(dr));
      expect(again.statusCode).toBe(200);
      expect(EvalCase.parse(again.json()).id).toBe(c.id);
      expect(await caseRows(agent)).toHaveLength(1);
      expect(llm.calls.length).toBe(calls); // AC-33
    });

    it('AC-93, EC-28: accept → draft → dismiss → save → 409 decision_changed {current_type, submitted_type}; 0 rows', async () => {
      const agent = await mkAgent();
      const finding = await mkFinding({ agentId: agent, accepted: new Date('2026-10-01T10:00:00Z') });
      const dr = await draftOf(finding);
      await pg.handle.db.update(t.findings).set({ dismissedAt: new Date('2026-10-02T10:00:00Z') }).where(eq(t.findings.id, finding));
      const res = await save(finding, bodyOf(dr));
      expect(res.statusCode).toBe(409);
      expect(res.json().error).toMatchObject({
        code: 'decision_changed',
        details: { current_type: 'must_not_flag', submitted_type: 'must_find' },
      });
      expect(await caseRows(agent)).toHaveLength(0);
    });

    it('EC-29: the finding deleted after the draft → 404; AC-4: untriaged → 422; AC-8/AC-9: out-of-hunk or oversize → 422', async () => {
      const agent = await mkAgent();
      const gone = await mkFinding({ agentId: agent, accepted: new Date() });
      const dr = await draftOf(gone);
      await pg.handle.db.delete(t.findings).where(eq(t.findings.id, gone));
      expect((await save(gone, bodyOf(dr))).statusCode).toBe(404);

      const untriaged = await mkFinding({ agentId: agent });
      const un = await save(untriaged, bodyOf(dr));
      expect([un.statusCode, un.json().error.code]).toEqual([422, 'finding_not_triaged']);

      const f = await mkFinding({ agentId: agent, accepted: new Date() });
      const fd = await draftOf(f);
      const outside = await save(f, bodyOf(fd, { expectation: { ...fd.expectation, start_line: 90, end_line: 91 } }));
      expect([outside.statusCode, outside.json().error.code]).toEqual([422, 'expectation_outside_diff']);
      const huge = await save(f, bodyOf(fd, { input_diff: `diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,1 +1,2 @@\n a\n+${'x'.repeat(210_000)}` }));
      expect([huge.statusCode, huge.json().error.code]).toEqual([422, 'frozen_input_too_large']);
      expect(await caseRows(agent)).toHaveLength(0);
    });

    it('AC-14, AC-14a: secrets typed into the modal are masked in the stored row', async () => {
      const agent = await mkAgent();
      const finding = await mkFinding({ agentId: agent, accepted: new Date() });
      const dr = await draftOf(finding);
      const res = await save(finding, bodyOf(dr, { name: `n ${TOKEN}`, notes: TOKEN, pr_title: TOKEN, pr_body: TOKEN, input_diff: dr.input_diff.replace('+b', `+${TOKEN}`) }));
      expect(res.statusCode, res.body).toBe(201);
      const row = (await caseRows(agent))[0]!;
      expect(JSON.stringify(row)).not.toContain(TOKEN);
      expect(row.inputDiff).toContain('ghp_XXXX');
    });
  });

  describe('Run case', () => {
    const run = (agent: string, payload: unknown) => app.inject({ method: 'POST', url: `/agents/${agent}/eval-cases/run`, payload: payload as object });
    const rowCounts = async () => {
      const db = pg.handle.db;
      const [cases] = await db.select({ n: count() }).from(t.evalCases);
      const [runs] = await db.select({ n: count() }).from(t.evalRuns);
      return { cases: cases!.n, runs: runs!.n };
    };

    it('AC-94, AC-95: scores the modal values; eval_cases / eval_runs and the dashboard are unchanged', async () => {
      const agent = await mkAgent();
      const finding = await mkFinding({ agentId: agent, file: 'a.ts', start: 2, end: 2, accepted: new Date(), files: { 'a.ts': PATCH_A } });
      const dr = await draftOf(finding);
      const beforeRows = await rowCounts();
      const beforeDash = (await app.inject({ method: 'GET', url: '/eval/dashboard' })).json();

      const res = await run(agent, { input_diff: dr.input_diff, pr_title: dr.input_meta.title, pr_body: dr.input_meta.body, expectation: dr.expectation });
      expect(res.statusCode, res.body).toBe(200);
      const out = EvalCaseRunResult.parse(res.json());
      expect(out).toMatchObject({ status: 'scored', pass: true, findings_matched: 1 });
      expect(out.agent_version).toBe(1);

      expect(await rowCounts()).toEqual(beforeRows);
      expect((await app.inject({ method: 'GET', url: '/eval/dashboard' })).json()).toEqual(beforeDash);
    });

    it('AC-94: a stub finding on the draft file and range → scored, pass, matched; the masked input comes back (EC-32)', async () => {
      const agent = await mkAgent();
      const finding = await mkFinding({ agentId: agent, file: 'a.ts', start: 2, end: 3, accepted: new Date(), files: { 'a.ts': PATCH_SECRET } });
      const dr = await draftOf(finding);
      const before = await rowCounts();
      const res = await run(agent, {
        input_diff: dr.input_diff,
        pr_title: `t ${TOKEN}`,
        pr_body: null,
        expectation: { type: 'must_find', file: 'a.ts', start_line: 2, end_line: 2 },
      });
      expect(res.statusCode, res.body).toBe(200);
      const out = EvalCaseRunResult.parse(res.json());
      expect(out).toMatchObject({ status: 'scored', pass: true, findings_matched: 1 });
      expect(out.actual[0]!.matched).toBe(true);
      expect(out.masked.pr_title).not.toContain(TOKEN);
      expect(JSON.stringify(out)).not.toContain(PEM_BODY);
      expect(llm.calls.at(-1)!.user).not.toContain(TOKEN);
      expect(await rowCounts()).toEqual(before);
    });

    it('AC-99: a suite run in flight for the agent does not block Run case', async () => {
      const agent = await mkAgent();
      await pg.handle.db.insert(t.evalRuns).values({ workspaceId: ws, ownerKind: 'agent', ownerId: agent, agentVersion: 1, status: 'running' });
      const res = await run(agent, { input_diff: `diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n${PATCH_A}`, pr_title: 'T', pr_body: null, expectation: { type: 'must_find', file: 'a.ts', start_line: 2, end_line: 2 } });
      expect(res.statusCode, res.body).toBe(200);
      expect(EvalCaseRunResult.parse(res.json()).status).toBe('scored');
    });

    it('EC-31: an unknown agent → 404; AC-98: no key → 422 (covered with a stub resolver in eval-case-run.test.ts)', async () => {
      const res = await run('00000000-0000-4000-8000-000000000000', { input_diff: 'x', pr_title: 'T', pr_body: null, expectation: { type: 'must_find', file: 'a.ts', start_line: 1, end_line: 1 } });
      expect(res.statusCode).toBe(404);
    });
  });
});
