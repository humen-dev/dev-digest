/**
 * SPEC-08 export flow end to end over a real Postgres (Testcontainers): the real
 * agents / repos adapters and the committed runner bundle, with a
 * `MockGitHubClient`. Gated on Docker like the other `*.it.test.ts` files.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { unzipSync } from 'fflate';
import type { FastifyInstance } from 'fastify';
import { CiExport, CiInstallation, CiPreview } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig, type AppConfig } from '../src/platform/config.js';
import { MockAuthProvider, MockGitHubClient, MockSecretsProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[ci-export] Docker not available — skipping integration tests.');
}

const REPO = 'acme/shop';

d('Export to CI (Testcontainers pg)', () => {
  let pg: PgFixture;
  let ws: string;
  let agentId: string;
  const apps: FastifyInstance[] = [];
  const tmpDirs: string[] = [];

  beforeAll(async () => {
    pg = await startPg();
    const [w] = await pg.handle.db.insert(t.workspaces).values({ name: 'ci-export' }).returning();
    ws = w!.id;
    const [a] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId: ws, name: 'Shop Reviewer', provider: 'openrouter', model: 'openai/gpt-4o', systemPrompt: 'Be strict.' })
      .returning();
    agentId = a!.id;
    const [skill] = await pg.handle.db
      .insert(t.skills)
      .values({ workspaceId: ws, name: 'Naming', description: 'd', type: 'custom', source: 'manual', body: 'Use camelCase.' })
      .returning();
    await pg.handle.db.insert(t.agentSkills).values({ agentId, skillId: skill!.id, order: 0 });
    const [r] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name: 'shop', fullName: REPO })
      .returning();
    await pg.handle.db.insert(t.memory).values([
      { workspaceId: ws, repoId: r!.id, scope: 'repo', kind: 'decision', content: 'Use pnpm.' },
      { workspaceId: ws, repoId: r!.id, scope: 'repo', kind: 'fact', content: 'Runs on :3001.' },
    ]);
  });
  afterAll(async () => {
    for (const a of apps) await a.close();
    for (const dir of tmpDirs) await rm(dir, { recursive: true, force: true });
    await pg?.stop();
  });

  async function mkApp(opts: { gh?: MockGitHubClient; token?: boolean; bundleDir?: string } = {}) {
    const gh = opts.gh ?? new MockGitHubClient();
    const base = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const config = { ...base, logLevel: 'silent', ...(opts.bundleDir ? { ciRunnerBundleDir: opts.bundleDir } : {}) } as AppConfig;
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        auth: new MockAuthProvider(undefined, { id: ws, name: 'ws' }),
        secrets: new MockSecretsProvider(opts.token === false ? {} : { GITHUB_TOKEN: 'ghs_notarealtoken' }),
        github: gh,
      },
    });
    apps.push(app);
    return { app, gh };
  }

  const post = (app: FastifyInstance, url: string, payload: object = { repo: REPO }) =>
    app.inject({ method: 'POST', url, payload });
  const rowCount = async () => (await pg.handle.db.select().from(t.ciInstallations).where(eq(t.ciInstallations.workspaceId, ws))).length;

  it('rejects an empty runner bundle directory with the runner message (EC-4)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ci-empty-bundle-'));
    tmpDirs.push(dir);
    const { app } = await mkApp({ bundleDir: dir });
    const res = await post(app, `/agents/${agentId}/ci/preview`);
    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toBe('Runner bundle missing — run pnpm --dir agent-runner build');
  });

  it('refuses the export without a GitHub token and writes no row (EC-1)', async () => {
    const { app, gh } = await mkApp({ token: false });
    const res = await post(app, `/agents/${agentId}/export-ci`);
    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toBe('Connect GitHub in Settings');
    expect(gh.calls).toEqual([]);
    expect(await rowCount()).toBe(0);
  });

  it('exports with the real adapters, stores the installation, and keeps the slug across a rename (AC-39, AC-86)', async () => {
    const { app, gh } = await mkApp({
      gh: new MockGitHubClient({ repoInfo: { id: 9001, full_name: REPO, default_branch: 'main', html_url: 'x' } }),
    });
    const preview = CiPreview.parse((await post(app, `/agents/${agentId}/ci/preview`)).json());
    const paths = preview.files.map((f) => f.path);
    expect(paths).toContain('.devdigest/agents/shop-reviewer.yaml');
    expect(paths).toContain('.devdigest/skills/naming.md');
    expect(paths).toContain('.devdigest/runner/index.js');
    expect(preview.files.find((f) => f.kind === 'memory')!.contents!.trim().split('\n')).toHaveLength(2);

    const res = await post(app, `/agents/${agentId}/export-ci`);
    expect(res.statusCode).toBe(201);
    const out = CiExport.parse(res.json());
    expect(out.installation).toMatchObject({ github_repo_id: 9001, manifest_slug: 'shop-reviewer', state: 'pr_open' });

    const [row] = await pg.handle.db.select().from(t.ciInstallations).where(eq(t.ciInstallations.workspaceId, ws));
    expect(row).toMatchObject({
      agentId,
      repo: REPO,
      targetType: 'gha',
      githubRepoId: 9001,
      manifestSlug: 'shop-reviewer',
      triggers: ['opened', 'synchronize'],
      postAs: 'github_review',
      agentVersion: 1,
      exportedCiFailOn: 'critical',
      state: 'pr_open',
    });
    expect(row!.workflowVersion).toBe(preview.workflow_version);

    await pg.handle.db.update(t.agents).set({ name: 'Renamed Agent', version: 2 }).where(eq(t.agents.id, agentId));
    const again = await post(app, `/agents/${agentId}/export-ci`);
    expect(again.statusCode).toBe(200);
    expect(CiExport.parse(again.json()).reused_pr).toBe(true);
    expect(await rowCount()).toBe(1);
    const manifests = gh.committed.map((c) => c.files.filter((f) => f.path.startsWith('.devdigest/agents/')).map((f) => f.path));
    expect(manifests).toEqual([['.devdigest/agents/shop-reviewer.yaml'], ['.devdigest/agents/shop-reviewer.yaml']]);

    const list = await app.inject({ method: 'GET', url: `/agents/${agentId}/ci/installations` });
    const installs = (list.json() as unknown[]).map((x) => CiInstallation.parse(x));
    expect(installs).toHaveLength(1);
    // the re-export stored agent_version 2 → not outdated; bump again to see the flag
    expect(installs[0]!.outdated).toBe(false);
    await pg.handle.db.update(t.agents).set({ version: 3 }).where(eq(t.agents.id, agentId));
    const bumped = await app.inject({ method: 'GET', url: `/agents/${agentId}/ci/installations` });
    expect(bumped.json()[0].outdated).toBe(true);
  });

  it('refuses a second agent for the same repository (AC-7)', async () => {
    const [b] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId: ws, name: 'Second Agent', provider: 'openrouter', model: 'm', systemPrompt: 'p' })
      .returning();
    const { app, gh } = await mkApp();
    const res = await post(app, `/agents/${b!.id}/export-ci`);
    expect(res.statusCode).toBe(200);
    expect(CiExport.parse(res.json()).refused_reason).toContain('Renamed Agent');
    expect(gh.calls).toEqual([]);
  });

  it('archives the preview set with the real runner bundle and writes nothing (AC-41, AC-82)', async () => {
    const { app, gh } = await mkApp({ token: false });
    const before = await rowCount();
    const preview = CiPreview.parse((await post(app, `/agents/${agentId}/ci/preview`)).json());
    const res = await post(app, `/agents/${agentId}/export-ci/archive`);
    expect(res.statusCode).toBe(200);
    const entries = unzipSync(new Uint8Array(res.rawPayload));
    expect(Object.keys(entries).sort()).toEqual(preview.files.map((f) => f.path).sort());
    expect(entries['.devdigest/runner/index.js']!.byteLength).toBe(
      preview.files.find((f) => f.path === '.devdigest/runner/index.js')!.bytes,
    );
    expect(await rowCount()).toBe(before);
    expect(gh.calls).toEqual([]);
  });

  it('serves the runs page from stored rows only', async () => {
    const { app, gh } = await mkApp();
    const res = await app.inject({ method: 'GET', url: '/ci/runs' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ runs: [], agents: [], repos: [] });
    expect(gh.calls).toEqual([]);
  });
});
