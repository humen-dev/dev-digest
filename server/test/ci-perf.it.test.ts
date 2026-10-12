/**
 * SPEC-07 NFR-2 / NFR-3 over a real Postgres (Testcontainers): the preview
 * answers within 3 s with 10 skills and 200 memory entries; the export within
 * 10 s with a 5 MB runner bundle and 100 ms of GitHub latency per call.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig, type AppConfig } from '../src/platform/config.js';
import { MockAuthProvider, MockGitHubClient, MockSecretsProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[ci-perf] Docker not available — skipping integration tests.');
}

const REPO = 'acme/perf';
const LATENCY_MS = 100;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class SlowGitHub extends MockGitHubClient {
  override async getRepository(...a: Parameters<MockGitHubClient['getRepository']>) {
    await sleep(LATENCY_MS);
    return super.getRepository(...a);
  }
  override async commitFiles(...a: Parameters<MockGitHubClient['commitFiles']>) {
    await sleep(LATENCY_MS);
    return super.commitFiles(...a);
  }
  override async findOpenPr(...a: Parameters<MockGitHubClient['findOpenPr']>) {
    await sleep(LATENCY_MS);
    return super.findOpenPr(...a);
  }
  override async openPullRequest(...a: Parameters<MockGitHubClient['openPullRequest']>) {
    await sleep(LATENCY_MS);
    return super.openPullRequest(...a);
  }
}

d('CI export performance (Testcontainers pg)', () => {
  let pg: PgFixture;
  let ws: string;
  let agentId: string;
  let bundleDir: string;
  let app: FastifyInstance;

  beforeAll(async () => {
    pg = await startPg();
    const db = pg.handle.db;
    const [w] = await db.insert(t.workspaces).values({ name: 'ci-perf' }).returning();
    ws = w!.id;
    const [a] = await db
      .insert(t.agents)
      .values({ workspaceId: ws, name: 'Perf Agent', provider: 'openrouter', model: 'm', systemPrompt: 'p' })
      .returning();
    agentId = a!.id;
    for (let i = 0; i < 10; i += 1) {
      const [s] = await db
        .insert(t.skills)
        .values({ workspaceId: ws, name: `Skill ${i}`, description: 'd', type: 'custom', source: 'manual', body: `Rule number ${i}.\n`.repeat(40) })
        .returning();
      await db.insert(t.agentSkills).values({ agentId, skillId: s!.id, order: i });
    }
    const [r] = await db.insert(t.repos).values({ workspaceId: ws, owner: 'acme', name: 'perf', fullName: REPO }).returning();
    await db.insert(t.memory).values(
      Array.from({ length: 200 }, (_, i) => ({
        workspaceId: ws,
        repoId: r!.id,
        scope: 'repo' as const,
        kind: 'fact' as const,
        content: `Memory entry ${i}: the team prefers small pull requests.`,
      })),
    );

    bundleDir = await mkdtemp(join(tmpdir(), 'ci-perf-bundle-'));
    const line = 'function step(a, b) { return a + b; }\n';
    await writeFile(join(bundleDir, 'index.js'), line.repeat(Math.ceil((5 * 1024 * 1024) / line.length)));
    await writeFile(join(bundleDir, 'package.json'), '{"type":"module"}\n');

    app = await buildApp({
      config: { ...loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv), logLevel: 'silent', ciRunnerBundleDir: bundleDir } as AppConfig,
      db,
      overrides: {
        auth: new MockAuthProvider(undefined, { id: ws, name: 'ws' }),
        secrets: new MockSecretsProvider({ GITHUB_TOKEN: 'ghs_notarealtoken' }),
        github: new SlowGitHub(),
      },
    });
  });
  afterAll(async () => {
    await app?.close();
    if (bundleDir) await rm(bundleDir, { recursive: true, force: true });
    await pg?.stop();
  });

  it('previews 10 skills and 200 memory entries within 3 s (NFR-2)', async () => {
    const started = performance.now();
    const res = await app.inject({ method: 'POST', url: `/agents/${agentId}/ci/preview`, payload: { repo: REPO } });
    const elapsed = performance.now() - started;
    expect(res.statusCode).toBe(200);
    const files = res.json().files as { kind: string; contents: string | null }[];
    expect(files.filter((f) => f.kind === 'skill')).toHaveLength(10);
    expect(files.find((f) => f.kind === 'memory')!.contents!.trim().split('\n')).toHaveLength(200);
    expect(elapsed).toBeLessThan(3000);
  });

  it('exports a 5 MB bundle with 100 ms GitHub latency within 10 s (NFR-3)', async () => {
    const started = performance.now();
    const res = await app.inject({ method: 'POST', url: `/agents/${agentId}/export-ci`, payload: { repo: REPO } });
    const elapsed = performance.now() - started;
    expect(res.statusCode).toBe(201);
    expect(elapsed).toBeLessThan(10_000);
  });
});
