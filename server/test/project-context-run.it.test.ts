/**
 * Project Context (SPEC-01, U7) — the run executor's INTEGRATION with a real
 * Postgres (Testcontainers) and a real on-disk clone. Service-level grouping/
 * statuses are covered in `project-context-service.test.ts`; the run
 * executor's pure logic (Live Log lines, trace shape, failure handling) with
 * a stubbed `resolveEffective` is covered in `project-context-run.test.ts`.
 * This file proves what only a real DB + a real filesystem + a real HTTP
 * route round-trip can prove: a disk edit or a route save reaches the next
 * run, a run already in flight keeps its START-TIME snapshot (EC-13, EC-18),
 * a symlink escape is excluded (UT-7), and a PR-head change to the SAME file
 * never shadows the working-tree original (UT-11).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, mkdir, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockGitClient, type MockLLMOptions } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { Review, RunTrace, StructuredRequest, StructuredResult } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[project-context-run] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const APPROVE_FIXTURE: Review = { verdict: 'approve', summary: 'Looks fine.', score: 95, findings: [] };

/** Default diff (`src/config.ts`) — unrelated to the project-context docs unless a test overrides it. */
const DEFAULT_DIFF =
  'diff --git a/src/config.ts b/src/config.ts\n--- a/src/config.ts\n+++ b/src/config.ts\n' +
  '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,';

const INTENT_FIXTURE = {
  intent: 'Keep the fixture reviewable.',
  in_scope: [],
  out_of_scope: [],
  out_of_scope_files: [],
  missing_context: [],
  confidence: 'medium',
};

/**
 * A `MockLLMProvider` whose `completeStructured` blocks on an externally
 * resolved gate — `started` flips to `true` the instant the call is made, so
 * a test can wait for "the engine call has begun" (i.e. project context was
 * already resolved — it runs strictly before) without a fixed sleep.
 */
class GatedLLMProvider extends MockLLMProvider {
  started = false;
  private gate: Promise<void>;
  private release!: () => void;

  constructor(opts: MockLLMOptions = {}) {
    super('openai', opts);
    this.gate = new Promise((resolve) => {
      this.release = resolve;
    });
  }
  releaseGate(): void {
    this.release();
  }
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.started = true;
    await this.gate;
    return super.completeStructured(req);
  }
}

async function waitUntil(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitUntil: timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
}

/** Creates `root/linkName` -> `target`; returns false (and skips) on Windows without Developer Mode (EPERM). */
async function trySymlink(target: string, linkPath: string): Promise<boolean> {
  try {
    await symlink(target, linkPath);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EPERM') return false;
    throw err;
  }
}

d('Project Context in a run (SPEC-01, U7 — Testcontainers pg + real clone)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoSeq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  /** A repo with a real on-disk clone (no git needed — the fs adapter doesn't read git state) + a PR. */
  async function setup(files: Record<string, string>, diff = DEFAULT_DIFF) {
    const cloneDir = await mkdtemp(join(tmpdir(), 'project-context-run-'));
    for (const [rel, text] of Object.entries(files)) {
      const dir = join(cloneDir, rel.split('/').slice(0, -1).join('/'));
      if (dir !== cloneDir) await mkdir(dir, { recursive: true });
      await writeFile(join(cloneDir, rel), text, 'utf8');
    }

    const name = `pc-run-${repoSeq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}`, clonePath: cloneDir })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 1,
        title: 'Test PR',
        author: 'tester',
        branch: 'feat/x',
        base: 'main',
        headSha: 'deadbeef',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body: null,
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });

    return { cloneDir, repo: repo!, pr: pr! };
  }

  function appWith(llm: unknown) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ diff: DEFAULT_DIFF }),
        llm: {
          openai: llm as never,
          // Intent pre-work resolves 'openrouter' by default — mocked so it
          // never reaches a real key/network (server INSIGHTS pattern).
          openrouter: new MockLLMProvider('openai', { structuredBySchema: { IntentClassification: INTENT_FIXTURE } }),
        },
      },
    });
  }

  async function createAgent(app: Awaited<ReturnType<typeof appWith>>) {
    const created = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: `Agent-${Math.random().toString(36).slice(2)}`,
        provider: 'openai',
        model: 'gpt-4.1',
        system_prompt: 'You are a reviewer.',
        repo_intel: false, // irrelevant to this feature; keeps the run to diff + project context only
      },
    });
    expect(created.statusCode).toBe(201);
    return created.json();
  }

  async function runAndGetTrace(app: Awaited<ReturnType<typeof appWith>>, prId: string, agentId: string) {
    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/review`, payload: { agentId } });
    expect(res.statusCode).toBe(200);
    const runId = res.json().runs[0].run_id;
    await waitForPrRuns(pg.handle.db, prId, { expected: 1 });
    const traceRes = await app.inject({ method: 'GET', url: `/runs/${runId}/trace` });
    expect(traceRes.statusCode).toBe(200);
    return { runId, trace: traceRes.json<RunTrace>() };
  }

  it('a file edited on disk before the run reaches the prompt — AC-41, AC-57', async () => {
    const { cloneDir, pr } = await setup({ 'specs/a.md': 'original text' });
    const app = await appWith(new MockLLMProvider('openai', { structured: APPROVE_FIXTURE }));
    try {
      const agent = await createAgent(app);
      await app.inject({ method: 'PUT', url: `/agents/${agent.id}/context-docs`, payload: { paths: ['specs/a.md'] } });

      await writeFile(join(cloneDir, 'specs/a.md'), 'EDITED TEXT ON DISK', 'utf8');

      const { trace } = await runAndGetTrace(app, pr.id, agent.id);
      expect(trace.prompt_assembly.specs).toContain('EDITED TEXT ON DISK');
      expect(trace.specs_read).toEqual(['specs/a.md']);
    } finally {
      await app.close();
      await rm(cloneDir, { recursive: true, force: true });
    }
  });

  it('saves via the route, then runs → the saved text is sent — AC-71', async () => {
    const { cloneDir, repo, pr } = await setup({ 'specs/a.md': 'v1 text' });
    const app = await appWith(new MockLLMProvider('openai', { structured: APPROVE_FIXTURE }));
    try {
      const agent = await createAgent(app);
      await app.inject({ method: 'PUT', url: `/agents/${agent.id}/context-docs`, payload: { paths: ['specs/a.md'] } });
      const saved = await app.inject({
        method: 'PUT',
        url: `/repos/${repo.id}/project-docs/content`,
        payload: { path: 'specs/a.md', text: 'v2 saved via route' },
      });
      expect(saved.statusCode).toBe(200);

      const { trace } = await runAndGetTrace(app, pr.id, agent.id);
      expect(trace.prompt_assembly.specs).toContain('v2 saved via route');
      expect(trace.prompt_assembly.specs).not.toContain('v1 text');
    } finally {
      await app.close();
      await rm(cloneDir, { recursive: true, force: true });
    }
  });

  it('a change to the attachment list / doc text AFTER a run starts does not affect that run — EC-13, EC-18', async () => {
    const { cloneDir, pr } = await setup({ 'specs/a.md': 'start-time text' });
    const gated = new GatedLLMProvider({ structured: APPROVE_FIXTURE });
    const app = await appWith(gated);
    try {
      const agent = await createAgent(app);
      await app.inject({ method: 'PUT', url: `/agents/${agent.id}/context-docs`, payload: { paths: ['specs/a.md'] } });

      const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
      expect(res.statusCode).toBe(200);
      const runId = res.json().runs[0].run_id;

      // The engine call has started ⇒ project context was already resolved
      // (it runs strictly before `reviewPullRequest` in `runOneAgent`).
      await waitUntil(() => gated.started);

      // Mutate AFTER the snapshot: detach the doc entirely AND change its text.
      await app.inject({ method: 'PUT', url: `/agents/${agent.id}/context-docs`, payload: { paths: [] } });
      await writeFile(join(cloneDir, 'specs/a.md'), 'CHANGED AFTER START', 'utf8');

      gated.releaseGate();
      await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
      const traceRes = await app.inject({ method: 'GET', url: `/runs/${runId}/trace` });
      const trace = traceRes.json<RunTrace>();

      expect(trace.specs_read).toEqual(['specs/a.md']);
      expect(trace.prompt_assembly.specs).toContain('start-time text');
      expect(trace.prompt_assembly.specs).not.toContain('CHANGED AFTER START');
    } finally {
      await app.close();
      await rm(cloneDir, { recursive: true, force: true });
    }
  });

  it('UT-7 (run): a symlinked attachment is skipped_unsafe_path and absent from the prompt', async () => {
    const outsideDir = await mkdtemp(join(tmpdir(), 'project-context-run-outside-'));
    await writeFile(join(outsideDir, 'secret.md'), 'outside secret text', 'utf8');
    const { cloneDir, pr } = await setup({ 'docs/a.md': 'inside text' });
    const linked = await trySymlink(join(outsideDir, 'secret.md'), join(cloneDir, 'docs', 'escape.md'));
    const app = await appWith(new MockLLMProvider('openai', { structured: APPROVE_FIXTURE }));
    try {
      if (!linked) return; // no symlink privilege in this environment (Windows, no Developer Mode)
      const agent = await createAgent(app);
      await app.inject({
        method: 'PUT',
        url: `/agents/${agent.id}/context-docs`,
        payload: { paths: ['docs/escape.md', 'docs/a.md'] },
      });

      const { trace } = await runAndGetTrace(app, pr.id, agent.id);
      const byPath = new Map((trace.project_context ?? []).map((e) => [e.path, e]));
      expect(byPath.get('docs/escape.md')?.status).toBe('skipped_unsafe_path');
      expect(byPath.get('docs/a.md')?.status).toBe('included');
      expect(trace.prompt_assembly.specs).not.toContain('outside secret text');
      expect(trace.specs_read).toEqual(['docs/a.md']);
    } finally {
      await app.close();
      await rm(cloneDir, { recursive: true, force: true });
      await rm(outsideDir, { recursive: true, force: true });
    }
  });

  it('UT-11: the PR head modifying an attached doc never shadows the working-tree original', async () => {
    // The diff touches the SAME path as the attached doc; the clone's on-disk
    // (working-tree) text differs from whatever the diff implies.
    const diff =
      'diff --git a/specs/a.md b/specs/a.md\n--- a/specs/a.md\n+++ b/specs/a.md\n' +
      '@@ -1,1 +1,1 @@\n-old baseline\n+PR-HEAD VERSION (never sent as project context)';
    const { cloneDir, pr } = await setup({ 'specs/a.md': 'WORKING-TREE ORIGINAL' }, diff);
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ diff }),
        llm: {
          openai: new MockLLMProvider('openai', { structured: APPROVE_FIXTURE }) as never,
          openrouter: new MockLLMProvider('openai', { structuredBySchema: { IntentClassification: INTENT_FIXTURE } }),
        },
      },
    });
    try {
      const agent = await createAgent(app);
      await app.inject({ method: 'PUT', url: `/agents/${agent.id}/context-docs`, payload: { paths: ['specs/a.md'] } });

      const { trace } = await runAndGetTrace(app, pr.id, agent.id);
      expect(trace.prompt_assembly.specs).toContain('WORKING-TREE ORIGINAL');
      expect(trace.prompt_assembly.specs).not.toContain('PR-HEAD VERSION');
    } finally {
      await app.close();
      await rm(cloneDir, { recursive: true, force: true });
    }
  });

  it('AC-33 (parity): the preview endpoint and a run on the same fixture report the same entries', async () => {
    const { cloneDir, repo, pr } = await setup({ 'specs/a.md': 'present', 'docs/gone.md': '' });
    // Attach a path that is never written to disk — it reads as skipped_missing in both.
    const app = await appWith(new MockLLMProvider('openai', { structured: APPROVE_FIXTURE }));
    try {
      const agent = await createAgent(app);
      await app.inject({
        method: 'PUT',
        url: `/agents/${agent.id}/context-docs`,
        payload: { paths: ['specs/a.md', 'docs/missing.md'] },
      });

      const previewRes = await app.inject({
        method: 'GET',
        url: `/agents/${agent.id}/context-preview?repo_id=${repo.id}`,
      });
      expect(previewRes.statusCode).toBe(200);
      const preview = previewRes.json();

      const { trace } = await runAndGetTrace(app, pr.id, agent.id);

      expect(trace.project_context).toEqual(preview.documents);
    } finally {
      await app.close();
      await rm(cloneDir, { recursive: true, force: true });
    }
  });
});
