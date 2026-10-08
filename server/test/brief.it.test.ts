/**
 * PR Brief (SPEC-04, U7) over a real Postgres (Testcontainers) through the real
 * HTTP surface. Gated on Docker like the other `*.it.test.ts` files.
 *
 * Service-level behavior with in-memory ports lives in `brief-service.test.ts`;
 * this file proves what only a real DB / the real routes can: persistence and
 * upsert-on-`pr_id` (AC-12), outdated-vs-head (AC-3/AC-4), the Settings →
 * Models override (AC-9), tenant isolation (EC-14), `{}` rows (EC-13), the
 * context-candidates route (AC-37), a missing key (EC-3) and the per-route
 * rate limit (EC-8 — the limiter is disabled under `NODE_ENV=test`, so that one
 * test builds the app with another env). The FK cascade from `pull_requests`
 * is `0000_init.sql:386` (EC-23, inspection).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import type { LLMProvider, StructuredRequest, StructuredResult } from '@devdigest/shared';
import { BriefContextCandidates, BriefPage } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig, type AppConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockAuthProvider, MockSecretsProvider } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[brief] Docker not available — skipping integration tests.');
}

const PATCH = '@@ -1,2 +1,4 @@\n a\n+b\n+c\n d';

const draftWith = (summary: string) => ({
  summary,
  risks: [{ kind: 'auth_surface', title: 'Auth', explanation: 'x', severity: 'high', file_refs: ['src/a.ts:2-3'] }],
  review_focus: [{ file: 'src/a.ts', line: 2, reason: 'check' }],
});

/** Returns the queued drafts in order (the last one repeats); records every request. */
class QueueLLM implements LLMProvider {
  readonly id = 'openai' as const;
  requests: StructuredRequest<unknown>[] = [];
  constructor(private queue: unknown[]) {}
  async listModels() {
    return [];
  }
  async complete(): Promise<never> {
    throw new Error('unused');
  }
  async embed() {
    return [];
  }
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.requests.push(req as StructuredRequest<unknown>);
    const data = this.queue.length > 1 ? this.queue.shift() : this.queue[0];
    return {
      data: req.schema.parse(data),
      model: req.model,
      tokensIn: 100,
      tokensOut: 50,
      costUsd: 0.001,
      apiCostUsd: 0.001,
      raw: JSON.stringify(data),
      attempts: 1,
    };
  }
}

d('PR Brief (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let cloneRoot: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    cloneRoot = await mkdtemp(join(tmpdir(), 'brief-clones-'));
  });
  afterAll(async () => {
    await pg?.stop();
    await rm(cloneRoot, { recursive: true, force: true });
  });

  async function setupPr(opts: { body?: string; docs?: string[]; withFiles?: boolean; ws?: string; clone?: boolean } = {}) {
    const db = pg.handle.db;
    const n = seq++;
    const ws = opts.ws ?? workspaceId;
    let clonePath: string | null = null;
    if (opts.clone !== false) {
      clonePath = join(cloneRoot, `repo-${n}`);
      await mkdir(clonePath, { recursive: true });
      for (const rel of opts.docs ?? []) {
        await mkdir(join(clonePath, rel.split('/').slice(0, -1).join('/')), { recursive: true });
        await writeFile(join(clonePath, rel), `# ${rel}\nguidance`, 'utf8');
      }
    }
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name: `brief-${n}`, fullName: `acme/brief-${n}`, clonePath })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws,
        repoId: repo!.id,
        number: 100 + n,
        title: 'Add limiter',
        author: 'dev',
        branch: 'feat',
        base: 'main',
        headSha: `sha-${n}`,
        body: opts.body ?? 'Adds a limiter',
      })
      .returning();
    if (opts.withFiles !== false) {
      await db.insert(t.prFiles).values({ prId: pr!.id, path: 'src/a.ts', additions: 2, deletions: 0, patch: PATCH });
    }
    return { prId: pr!.id, repoId: repo!.id, headSha: pr!.headSha };
  }

  function makeApp(opts: { llm?: LLMProvider; nodeEnv?: string; secrets?: MockSecretsProvider } = {}) {
    const config: AppConfig = {
      ...loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      nodeEnv: (opts.nodeEnv ?? 'test') as AppConfig['nodeEnv'],
      logLevel: 'silent',
    };
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        ...(opts.llm ? { llm: { openai: opts.llm } } : {}),
        ...(opts.secrets ? { secrets: opts.secrets, auth: new MockAuthProvider(undefined, { id: workspaceId, name: 'default' }) } : {}),
      },
    });
  }

  const storedRows = async (prId: string) =>
    pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));

  it('AC-6, AC-12: POST generates; a regenerate replaces the row in place (one row, second content)', async () => {
    const { prId } = await setupPr();
    const llm = new QueueLLM([draftWith('First.'), draftWith('Second.')]);
    const app = await makeApp({ llm });

    const first = await app.inject({ method: 'POST', url: `/pulls/${prId}/brief`, payload: {} });
    expect(first.statusCode, first.body).toBe(200);
    const page = BriefPage.parse(first.json());
    expect(page.status).toBe('generated');
    expect(page.brief).toMatchObject({ summary: 'First.', review_focus: [{ file: 'src/a.ts', line: 2 }] });
    expect(page.brief?.risks).toHaveLength(1);
    expect(page.provenance).toMatchObject({ model: 'gpt-4.1', attempts: 1, cost_usd: 0.001 });

    const second = await app.inject({ method: 'POST', url: `/pulls/${prId}/brief`, payload: { regenerate: true } });
    expect(second.json().brief.summary).toBe('Second.');
    const rows = await storedRows(prId);
    expect(rows).toHaveLength(1);
    expect((rows[0]!.json as { brief: { summary: string } }).brief.summary).toBe('Second.');
    expect(llm.requests).toHaveLength(2);
    expect(llm.requests[0]).toMatchObject({ maxTokens: 1500, maxRetries: 1 });
    await app.close();
  });

  it('AC-3, AC-4: stored SHA = head → generated; head moved → outdated with the brief unchanged', async () => {
    const { prId } = await setupPr();
    const app = await makeApp({ llm: new QueueLLM([draftWith('Kept.')]) });
    await app.inject({ method: 'POST', url: `/pulls/${prId}/brief`, payload: {} });

    const fresh = await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` });
    expect(fresh.json().status).toBe('generated');

    await pg.handle.db.update(t.pullRequests).set({ headSha: 'sha-moved' }).where(eq(t.pullRequests.id, prId));
    const stale = BriefPage.parse((await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` })).json());
    expect(stale.status).toBe('outdated');
    expect(stale.brief?.summary).toBe('Kept.');
    expect(stale.current_head_sha).toBe('sha-moved');
    await app.close();
  });

  it('AC-9: the Settings → Models override reaches the stub; the default is gpt-4.1', async () => {
    const { prId } = await setupPr();
    const llm = new QueueLLM([draftWith('Model.')]);
    const app = await makeApp({ llm });
    await app.inject({ method: 'POST', url: `/pulls/${prId}/brief`, payload: {} });
    expect(llm.requests[0]!.model).toBe('gpt-4.1');

    const [row] = await pg.handle.db
      .insert(t.settings)
      .values({ workspaceId, key: 'feature_models', value: { risk_brief: { provider: 'openai', model: 'gpt-4o-mini' } } })
      .returning();
    await app.inject({ method: 'POST', url: `/pulls/${prId}/brief`, payload: { regenerate: true } });
    expect(llm.requests[1]!.model).toBe('gpt-4o-mini');
    await pg.handle.db.delete(t.settings).where(eq(t.settings.id, row!.id));
    await app.close();
  });

  it('EC-13: a {} row reads as none; EC-14: another workspace gets 404 on GET and POST', async () => {
    const { prId } = await setupPr();
    await pg.handle.db.insert(t.prBrief).values({ prId, json: {} });
    const app = await makeApp({ llm: new QueueLLM([draftWith('x')]) });
    expect((await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` })).json()).toMatchObject({
      status: 'none',
      brief: null,
    });

    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other' }).returning();
    const foreign = await setupPr({ ws: other!.id });
    expect((await app.inject({ method: 'GET', url: `/pulls/${foreign.prId}/brief` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/pulls/${foreign.prId}/brief`, payload: {} })).statusCode).toBe(404);
    await app.close();
  });

  it('EC-3: no API key → 422 model_not_configured', async () => {
    const { prId } = await setupPr();
    const app = await makeApp({ secrets: new MockSecretsProvider({}) });
    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/brief`, payload: {} });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('model_not_configured');
    await app.close();
  });

  it('AC-37: the candidates route lists the three spec docs the PR references', async () => {
    const { prId } = await setupPr({
      body: 'See specs/a.md, specs/b.md and specs/c.md',
      docs: ['specs/a.md', 'specs/b.md', 'specs/c.md'],
    });
    const app = await makeApp({ llm: new QueueLLM([draftWith('x')]) });
    const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/brief/context-candidates` });
    expect(res.statusCode, res.body).toBe(200);
    const body = BriefContextCandidates.parse(res.json());
    expect(body.cloned).toBe(true);
    expect(body.candidates).toHaveLength(3);
    expect(body.candidates.every((c) => c.preselected && c.reason_code === 'pr_referenced')).toBe(true);

    // AC-34: with no context_paths those preselected docs are what the brief is built from
    const post = await app.inject({ method: 'POST', url: `/pulls/${prId}/brief`, payload: {} });
    expect(post.json().provenance.context_docs.map((c: { path: string }) => c.path).sort()).toEqual([
      'specs/a.md',
      'specs/b.md',
      'specs/c.md',
    ]);
    await app.close();
  });

  it('EC-12: no clone → docs skipped_not_cloned + no_context_docs', async () => {
    const { prId } = await setupPr({ clone: false });
    const app = await makeApp({ llm: new QueueLLM([draftWith('x')]) });
    const post = await app.inject({
      method: 'POST',
      url: `/pulls/${prId}/brief`,
      payload: { context_paths: ['docs/a.md'] },
    });
    const prov = post.json().provenance;
    expect(prov.context_docs).toEqual([{ path: 'docs/a.md', status: 'skipped_not_cloned', tokens: null }]);
    expect(prov.missing_sources).toContain('no_context_docs');
    await app.close();
  });

  it('EC-8: the 11th POST in a minute is rate-limited (429) when NODE_ENV is not "test"', async () => {
    const { prId } = await setupPr();
    const app = await makeApp({ llm: new QueueLLM([draftWith('x')]), nodeEnv: 'development' });
    for (let i = 0; i < 10; i++) {
      const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/brief`, payload: {} });
      expect(res.statusCode).toBe(200);
    }
    const eleventh = await app.inject({ method: 'POST', url: `/pulls/${prId}/brief`, payload: {} });
    expect(eleventh.statusCode).toBe(429);
    await app.close();
  });
});
