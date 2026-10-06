/**
 * Onboarding tour (SPEC-03, U5) over a real Postgres (Testcontainers) and a
 * real on-disk git clone (`simple-git`, pattern `project-context.it.test.ts`).
 * Gated on Docker like the other `*.it.test.ts` files.
 *
 * Service-level behavior with fake ports (grounding, check order, timeout
 * race, error taxonomy) is covered in `onboarding-tour-service.test.ts`; this
 * file exercises what only a real DB and a real git clone can prove: the
 * tour is pinned to the commit it was generated from even after the clone's
 * HEAD moves on (AC-38, EC-18), a foreign-key violation on a mid-generation
 * repo delete leaves no row (EC-17), a legacy row reads back as `tour: null`
 * (EC-19), and the route's per-route rate limit actually returns 429 (NFR-7
 * — the global limiter, and therefore the per-route override, is disabled
 * when `NODE_ENV=test`, so this one test builds the app with another env).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { simpleGit } from 'simple-git';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig, type AppConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { DeferredLLMProvider, fakeRepoIntel, type FakeRepoIntelOpts } from './helpers/onboarding-fakes.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[onboarding] Docker not available — skipping integration tests.');
}

const DRAFT = {
  overview: 'Entry point is `src/app.ts`.',
  diagram: '',
  critical_paths: [],
  how_to_run: [],
  guided_reading: [{ path: 'src/app.ts', reason: 'entry point' }],
  first_tasks: [],
};

async function writeFileAt(fsp: typeof import('node:fs/promises'), root: string, rel: string, text: string) {
  const dirPath = join(root, rel.split('/').slice(0, -1).join('/'));
  await fsp.mkdir(dirPath, { recursive: true });
  await fsp.writeFile(join(root, rel), text, 'utf8');
}

d('Onboarding tour (Testcontainers pg + real git clone)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let cloneRoot: string;
  let repoSeq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    cloneRoot = await mkdtemp(join(tmpdir(), 'onboarding-clones-'));
  });
  afterAll(async () => {
    await pg?.stop();
    await rm(cloneRoot, { recursive: true, force: true });
  });

  /**
   * A real git repo at `<cloneRoot>/acme/<name>` — `GitTreeReader`'s own
   * clone-path convention (adapters/git/tree.ts), NOT the `repos.clonePath`
   * DB column (set too, but only the service's "is this repo cloned at all"
   * guard reads it).
   */
  async function setupRepo(files: Record<string, string>) {
    const fsp = await import('node:fs/promises');
    const name = `onboarding-${repoSeq++}`;
    const repoDir = join(cloneRoot, 'acme', name);
    await fsp.mkdir(repoDir, { recursive: true });
    for (const [rel, text] of Object.entries(files)) await writeFileAt(fsp, repoDir, rel, text);
    const git = simpleGit(repoDir);
    await git.init();
    await git.addConfig('user.email', 'test@example.com');
    await git.addConfig('user.name', 'Test');
    await git.add('.');
    await git.commit('initial');
    const shaA = (await git.revparse(['HEAD'])).trim();

    const [row] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}`, clonePath: repoDir })
      .returning();
    return { repoId: row!.id, repoDir, git, shaA };
  }

  function makeApp(opts: { repoIntel?: FakeRepoIntelOpts; llm?: unknown; nodeEnv?: string } = {}) {
    const config: AppConfig = {
      ...loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      cloneDir: cloneRoot,
      nodeEnv: (opts.nodeEnv ?? 'test') as AppConfig['nodeEnv'],
      logLevel: 'silent',
    };
    const repoIntel = fakeRepoIntel({ topFiles: ['src/app.ts'], ...opts.repoIntel }) as unknown as RepoIntel;
    const llm = opts.llm ?? new MockLLMProvider('openai', { structuredBySchema: { OnboardingTourDraft: DRAFT } });
    return buildApp({ config, db: pg.handle.db, overrides: { repoIntel, llm: { openrouter: llm as never } } });
  }

  it('AC-31: POST generates a tour and GET returns the same one afterwards', async () => {
    const { repoId, shaA } = await setupRepo({ 'src/app.ts': 'export const main = 1;' });
    const app = await makeApp({ repoIntel: { indexState: { lastIndexedSha: shaA } } });

    const post = await app.inject({ method: 'POST', url: `/repos/${repoId}/tour/generate` });
    expect(post.statusCode).toBe(200);
    const posted = post.json();
    expect(posted.tour_commit).toBe(shaA);

    const get = await app.inject({ method: 'GET', url: `/repos/${repoId}/tour` });
    expect(get.statusCode).toBe(200);
    expect(get.json().tour).toMatchObject({ tour_commit: shaA, repo_id: repoId });

    await app.close();
  });

  it('AC-38, EC-18: the tour is pinned to the indexed commit even after HEAD moves on', async () => {
    const { repoId, repoDir, git, shaA } = await setupRepo({ 'src/app.ts': 'export const V = "A";' });

    // Move the clone's HEAD past the indexed commit — the generation must
    // still read commit A's tree and blobs, never the working tree's B.
    const fsp = await import('node:fs/promises');
    await writeFileAt(fsp, repoDir, 'src/app.ts', 'export const V = "B";');
    await writeFileAt(fsp, repoDir, 'src/new-in-b.ts', 'export const onlyInB = true;');
    await git.add('.');
    await git.commit('second');

    const deferred = new DeferredLLMProvider();
    const app = await makeApp({ repoIntel: { indexState: { lastIndexedSha: shaA } }, llm: deferred });

    const pending = app.inject({ method: 'POST', url: `/repos/${repoId}/tour/generate` });
    await vi.waitFor(() => expect(deferred.calls).toBe(1));
    const prompt = deferred.lastPromptText();
    expect(prompt).toContain('V = "A"');
    expect(prompt).not.toContain('V = "B"');
    expect(prompt).not.toContain('new-in-b.ts');

    deferred.resolveWith(DRAFT);
    const res = await pending;
    expect(res.statusCode).toBe(200);
    expect(res.json().tour_commit).toBe(shaA);

    await app.close();
  });

  it('EC-17: the repo is deleted mid-generation → the generation still finishes, but no row is persisted', async () => {
    const { repoId, shaA } = await setupRepo({ 'src/app.ts': 'export const main = 1;' });
    const deferred = new DeferredLLMProvider();
    const app = await makeApp({ repoIntel: { indexState: { lastIndexedSha: shaA } }, llm: deferred });

    const pending = app.inject({ method: 'POST', url: `/repos/${repoId}/tour/generate` });
    await vi.waitFor(() => expect(deferred.calls).toBe(1));

    await pg.handle.db.delete(t.repos).where(eq(t.repos.id, repoId));

    deferred.resolveWith(DRAFT);
    await pending; // the in-memory generation completes; the DB write hits a FK violation and is swallowed

    const [row] = await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId));
    expect(row).toBeUndefined();

    await app.close();
  });

  it('EC-19: a legacy {sections:[...]} row reads back as tour: null', async () => {
    const { repoId, shaA } = await setupRepo({ 'src/app.ts': 'export const main = 1;' });
    await pg.handle.db.insert(t.onboarding).values({ repoId, json: { sections: [] } });

    const app = await makeApp({ repoIntel: { indexState: { lastIndexedSha: shaA } } });
    const get = await app.inject({ method: 'GET', url: `/repos/${repoId}/tour` });
    expect(get.statusCode).toBe(200);
    expect(get.json().tour).toBeNull();

    await app.close();
  });

  it('NFR-7: the 11th POST in a minute is rate-limited (429) when NODE_ENV is not "test"', async () => {
    const { repoId, shaA } = await setupRepo({ 'src/app.ts': 'export const main = 1;' });
    const app = await makeApp({ repoIntel: { indexState: { lastIndexedSha: shaA } }, nodeEnv: 'development' });

    for (let i = 0; i < 10; i++) {
      const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/tour/generate` });
      expect(res.statusCode).toBe(200);
    }
    const eleventh = await app.inject({ method: 'POST', url: `/repos/${repoId}/tour/generate` });
    expect(eleventh.statusCode).toBe(429);

    await app.close();
  });
});
