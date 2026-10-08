/**
 * Project Context (SPEC-01, U4) over a real Postgres (Testcontainers) and a
 * real on-disk git clone (`simple-git`, tmp dir — pattern
 * `server/test/repo-intel-python.it.test.ts:56`). Gated on Docker like the
 * other `*.it.test.ts` files (server INSIGHTS 2026-09-21).
 *
 * Service-level behavior with fake ports (grouping, statuses, hostile-path
 * rejection, duplicates, determinism) is covered in
 * `project-context-service.test.ts`; this file exercises what only a real DB
 * and a real filesystem can prove: stored attachment order round-tripping,
 * `used_by`/usage joins, FK cascade on delete, and the save route's actual
 * effect on the working tree (content, git status, body-limit 413).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { simpleGit } from 'simple-git';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig, type AppConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[project-context] Docker not available — skipping integration tests.');
}

async function writeFileAt(fs: typeof import('node:fs/promises'), root: string, rel: string, text: string) {
  const dirPath = join(root, rel.split('/').slice(0, -1).join('/'));
  await fs.mkdir(dirPath, { recursive: true });
  await fs.writeFile(join(root, rel), text, 'utf8');
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

d('Project Context (Testcontainers pg + real clone)', () => {
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

  function makeApp(configOverrides: Partial<AppConfig> = {}) {
    const config = { ...loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv), ...configOverrides };
    return buildApp({ config, db: pg.handle.db });
  }

  /** A fresh git-initialised clone with the given files committed, plus an agent + a skill in the workspace. */
  async function setup(files: Record<string, string>) {
    const fsp = await import('node:fs/promises');
    const cloneDir = await mkdtemp(join(tmpdir(), 'project-context-'));
    // Always-present placeholder so `git commit` always has something to
    // commit, even when `files` is empty (not `.md` — never shows up as a doc).
    await writeFileAt(fsp, cloneDir, '.gitkeep', '');
    for (const [rel, text] of Object.entries(files)) await writeFileAt(fsp, cloneDir, rel, text);
    const git = simpleGit(cloneDir);
    await git.init();
    await git.addConfig('user.email', 'test@example.com');
    await git.addConfig('user.name', 'Test');
    await git.add('.');
    await git.commit('initial');

    const name = `project-context-${repoSeq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}`, clonePath: cloneDir })
      .returning();
    const [agent] = await pg.handle.db
      .insert(t.agents)
      .values({
        workspaceId,
        name: `agent-${name}`,
        provider: 'openai',
        model: 'gpt-4o',
        systemPrompt: 'You review code.',
      })
      .returning();
    const [skill] = await pg.handle.db
      .insert(t.skills)
      .values({ workspaceId, name: `skill-${name}`, description: 'd', type: 'rubric', source: 'manual', body: 'b' })
      .returning();

    return { cloneDir, repo: repo!, agent: agent!, skill: skill!, git };
  }

  describe('GET /repos/:id/project-docs — AC-2, AC-5, AC-9', () => {
    it('returns path, bucket, estimated tokens and used-by count for each doc — AC-2', async () => {
      const { repo, agent } = await setup({
        'README.md': '# hello',
        'docs/a.md': '# a',
        'specs/b.md': '# spec '.repeat(20),
      });
      const app = await makeApp();
      await app.inject({
        method: 'PUT',
        url: `/agents/${agent.id}/context-docs`,
        payload: { paths: ['README.md'] },
      });

      const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/project-docs` });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.cloned).toBe(true);
      expect(body.total).toBe(3);
      const byPath = new Map(body.documents.map((d: { path: string }) => [d.path, d]));
      expect(byPath.get('README.md')).toMatchObject({ bucket: 'root', used_by_agents: 1 });
      expect(byPath.get('docs/a.md')).toMatchObject({ bucket: 'docs', used_by_agents: 0 });
      expect(byPath.get('specs/b.md')).toMatchObject({ bucket: 'specs' });
      await app.close();
    });

    it('excludes a configured extra directory name, includes it when unset — AC-5', async () => {
      const { repo } = await setup({ 'dist/a.md': '# generated' });

      const onApp = await makeApp({ projectDocsExcludedDirs: ['dist'] });
      const onRes = await onApp.inject({ method: 'GET', url: `/repos/${repo.id}/project-docs` });
      expect(onRes.json().documents.map((d: { path: string }) => d.path)).not.toContain('dist/a.md');
      await onApp.close();

      const offApp = await makeApp({ projectDocsExcludedDirs: [] });
      const offRes = await offApp.inject({ method: 'GET', url: `/repos/${repo.id}/project-docs` });
      expect(offRes.json().documents.map((d: { path: string }) => d.path)).toContain('dist/a.md');
      await offApp.close();
    });

    it('returns cloned: false for a repo without a clone — EC-1/EC-2 (API half)', async () => {
      const name = `no-clone-${repoSeq++}`;
      const [repo] = await pg.handle.db
        .insert(t.repos)
        .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
        .returning();
      const app = await makeApp();
      const res = await app.inject({ method: 'GET', url: `/repos/${repo!.id}/project-docs` });
      expect(res.json()).toMatchObject({ cloned: false, documents: [], total: 0 });
      await app.close();
    });

    it('names both the agent and the skill attaching a path — AC-9', async () => {
      const { repo, agent, skill } = await setup({ 'docs/a.md': '# a' });
      const app = await makeApp();
      await app.inject({ method: 'PUT', url: `/agents/${agent.id}/context-docs`, payload: { paths: ['docs/a.md'] } });
      await app.inject({ method: 'PUT', url: `/skills/${skill.id}/context-docs`, payload: { paths: ['docs/a.md'] } });

      const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/project-docs/usage?path=docs/a.md` });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.agents.map((a: { id: string }) => a.id)).toContain(agent.id);
      expect(body.skills.map((s: { id: string }) => s.id)).toContain(skill.id);
      await app.close();
    });
  });

  describe('agent/skill context-docs — AC-29, AC-30, AC-31, AC-32, EC-12, EC-14, EC-17', () => {
    it('round-trips a 3-path order for an agent, leaves version unchanged — AC-29, AC-31, AC-32', async () => {
      const { agent } = await setup({ 'a.md': 'a', 'b.md': 'b', 'c.md': 'c' });
      const app = await makeApp();
      const before = await pg.handle.db.select().from(t.agents).where(eq(t.agents.id, agent.id));

      const put = await app.inject({
        method: 'PUT',
        url: `/agents/${agent.id}/context-docs`,
        payload: { paths: ['c.md', 'a.md', 'b.md'] },
      });
      expect(put.statusCode).toBe(200);
      expect(put.json().paths).toEqual(['c.md', 'a.md', 'b.md']);

      const get = await app.inject({ method: 'GET', url: `/agents/${agent.id}/context-docs` });
      expect(get.json().paths).toEqual(['c.md', 'a.md', 'b.md']);

      const after = await pg.handle.db.select().from(t.agents).where(eq(t.agents.id, agent.id));
      expect(after[0]!.version).toBe(before[0]!.version);
      await app.close();
    });

    it('round-trips order for a skill, leaves version unchanged — AC-30, AC-32', async () => {
      const { skill } = await setup({ 'a.md': 'a', 'b.md': 'b' });
      const app = await makeApp();
      const before = await pg.handle.db.select().from(t.skills).where(eq(t.skills.id, skill.id));

      await app.inject({ method: 'PUT', url: `/skills/${skill.id}/context-docs`, payload: { paths: ['b.md', 'a.md'] } });
      const get = await app.inject({ method: 'GET', url: `/skills/${skill.id}/context-docs` });
      expect(get.json().paths).toEqual(['b.md', 'a.md']);

      const after = await pg.handle.db.select().from(t.skills).where(eq(t.skills.id, skill.id));
      expect(after[0]!.version).toBe(before[0]!.version);
      await app.close();
    });

    it('two sequential PUTs: the last list wins — EC-12', async () => {
      const { agent } = await setup({ 'a.md': 'a', 'b.md': 'b' });
      const app = await makeApp();
      await app.inject({ method: 'PUT', url: `/agents/${agent.id}/context-docs`, payload: { paths: ['a.md'] } });
      await app.inject({ method: 'PUT', url: `/agents/${agent.id}/context-docs`, payload: { paths: ['b.md'] } });
      const get = await app.inject({ method: 'GET', url: `/agents/${agent.id}/context-docs` });
      expect(get.json().paths).toEqual(['b.md']);
      await app.close();
    });

    it('a duplicate path is rejected with 422', async () => {
      const { agent } = await setup({ 'a.md': 'a' });
      const app = await makeApp();
      const res = await app.inject({
        method: 'PUT',
        url: `/agents/${agent.id}/context-docs`,
        payload: { paths: ['a.md', 'a.md'] },
      });
      expect(res.statusCode).toBe(422);
      await app.close();
    });

    it('deleting an agent leaves no orphan attachment rows — EC-14', async () => {
      const { agent } = await setup({ 'a.md': 'a' });
      const app = await makeApp();
      await app.inject({ method: 'PUT', url: `/agents/${agent.id}/context-docs`, payload: { paths: ['a.md'] } });
      await pg.handle.db.delete(t.agents).where(eq(t.agents.id, agent.id));
      const rows = await pg.handle.db.select().from(t.agentContextDocs).where(eq(t.agentContextDocs.agentId, agent.id));
      expect(rows).toHaveLength(0);
      await app.close();
    });

    it('deleting a skill leaves no orphan attachment rows — EC-14', async () => {
      const { skill } = await setup({ 'a.md': 'a' });
      const app = await makeApp();
      await app.inject({ method: 'PUT', url: `/skills/${skill.id}/context-docs`, payload: { paths: ['a.md'] } });
      await pg.handle.db.delete(t.skills).where(eq(t.skills.id, skill.id));
      const rows = await pg.handle.db
        .select()
        .from(t.skillContextDocs)
        .where(eq(t.skillContextDocs.skillId, skill.id));
      expect(rows).toHaveLength(0);
      await app.close();
    });
  });

  describe('GET /agents/:id/context-preview — AC-33', () => {
    it('returns included + skipped_missing with counted tokens in grouped order', async () => {
      const { repo, agent } = await setup({ 'docs/present.md': 'present text' });
      const app = await makeApp();
      await app.inject({
        method: 'PUT',
        url: `/agents/${agent.id}/context-docs`,
        payload: { paths: ['docs/present.md', 'docs/absent.md'] },
      });

      const res = await app.inject({
        method: 'GET',
        url: `/agents/${agent.id}/context-preview?repo_id=${repo.id}`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      const byPath = new Map(body.documents.map((d: { path: string; status: string }) => [d.path, d]));
      expect(byPath.get('docs/present.md')).toMatchObject({ status: 'included' });
      expect(byPath.get('docs/absent.md')).toMatchObject({ status: 'skipped_missing', tokens: null });
      expect(body.total_tokens).toBeGreaterThan(0);
      await app.close();
    });
  });

  describe('read / save on the real clone — AC-66, AC-67, AC-69, EC-24, UT-6, UT-7, UT-12', () => {
    it('saves over an existing file; content equals the sent text — AC-66', async () => {
      const { repo } = await setup({ 'docs/a.md': 'old text' });
      const app = await makeApp();
      const res = await app.inject({
        method: 'PUT',
        url: `/repos/${repo.id}/project-docs/content`,
        payload: { path: 'docs/a.md', text: 'brand new text' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().text).toBe('brand new text');

      const readBack = await app.inject({
        method: 'GET',
        url: `/repos/${repo.id}/project-docs/content?path=docs/a.md`,
      });
      expect(readBack.json().text).toBe('brand new text');
      await app.close();
    });

    it('leaves HEAD unchanged and nothing staged; the file shows modified — AC-67', async () => {
      const { repo, git } = await setup({ 'docs/a.md': 'old text' });
      const headBefore = await git.revparse(['HEAD']);
      const app = await makeApp();
      await app.inject({
        method: 'PUT',
        url: `/repos/${repo.id}/project-docs/content`,
        payload: { path: 'docs/a.md', text: 'edited' },
      });

      const headAfter = await git.revparse(['HEAD']);
      expect(headAfter).toBe(headBefore);
      const status = await git.status();
      expect(status.staged).toEqual([]);
      expect(status.modified).toContain('docs/a.md');
      await app.close();
    });

    it('404s saving a non-existent or excluded path, creates no file — AC-69', async () => {
      const { repo, cloneDir } = await setup({});
      const app = await makeApp();
      for (const path of ['docs/new.md', '.github/x.md']) {
        const res = await app.inject({
          method: 'PUT',
          url: `/repos/${repo.id}/project-docs/content`,
          payload: { path, text: 'x' },
        });
        expect(res.statusCode).toBe(404);
      }
      const fsp = await import('node:fs/promises');
      await expect(fsp.access(join(cloneDir, 'docs/new.md'))).rejects.toThrow();
      await app.close();
    });

    it('two sequential saves: the file holds the second text — EC-24', async () => {
      const { repo } = await setup({ 'docs/a.md': 'v1' });
      const app = await makeApp();
      await app.inject({
        method: 'PUT',
        url: `/repos/${repo.id}/project-docs/content`,
        payload: { path: 'docs/a.md', text: 'v2' },
      });
      await app.inject({
        method: 'PUT',
        url: `/repos/${repo.id}/project-docs/content`,
        payload: { path: 'docs/a.md', text: 'v3' },
      });
      const res = await app.inject({
        method: 'GET',
        url: `/repos/${repo.id}/project-docs/content?path=docs/a.md`,
      });
      expect(res.json().text).toBe('v3');
      await app.close();
    });

    it.each([
      ['absolute path', '/etc/secrets.md'],
      ['drive letter', 'C:\\notes.md'],
      ['parent traversal', '../outside.md'],
      ['wrong extension', 'notes.txt'],
    ])('rejects a hostile path on read and save with 422, no file touched — %s', async (_label, path) => {
      const { repo, cloneDir } = await setup({ 'docs/a.md': 'a' });
      const app = await makeApp();

      const readRes = await app.inject({
        method: 'GET',
        url: `/repos/${repo.id}/project-docs/content?path=${encodeURIComponent(path)}`,
      });
      expect(readRes.statusCode).toBe(422);

      const saveRes = await app.inject({
        method: 'PUT',
        url: `/repos/${repo.id}/project-docs/content`,
        payload: { path, text: 'x' },
      });
      expect(saveRes.statusCode).toBe(422);

      const fsp = await import('node:fs/promises');
      await expect(fsp.access(join(cloneDir, path.replace(/^\/+/, '').replace(/\\/g, '/')))).rejects.toThrow();
      await app.close();
    });

    it('rejects a symlink escaping the clone with 422, excludes it from the list — UT-7', async () => {
      const outsideDir = await mkdtemp(join(tmpdir(), 'project-context-outside-'));
      const fsp = await import('node:fs/promises');
      await fsp.writeFile(join(outsideDir, 'secret.md'), 'outside text', 'utf8');
      const { repo, cloneDir } = await setup({ 'docs/a.md': 'a' });
      const linked = await trySymlink(join(outsideDir, 'secret.md'), join(cloneDir, 'docs', 'escape.md'));
      if (!linked) {
        // No symlink privilege in this environment (Windows without Developer
        // Mode) — nothing to assert; project-docs-fs.test.ts covers this
        // adapter behavior directly with the same skip.
        await rm(outsideDir, { recursive: true, force: true });
        return;
      }

      const app = await makeApp();
      const list = await app.inject({ method: 'GET', url: `/repos/${repo.id}/project-docs` });
      expect(list.json().documents.map((d: { path: string }) => d.path)).not.toContain('docs/escape.md');

      const readRes = await app.inject({
        method: 'GET',
        url: `/repos/${repo.id}/project-docs/content?path=docs/escape.md`,
      });
      expect(readRes.statusCode).toBe(422);

      await app.close();
      await rm(outsideDir, { recursive: true, force: true });
    });

    it('rejects a body over the 1 MiB limit with 413, leaves the file unchanged — UT-12', async () => {
      const { repo, cloneDir } = await setup({ 'docs/a.md': 'original' });
      const app = await makeApp();
      const oversized = 'x'.repeat(1_048_577);
      const res = await app.inject({
        method: 'PUT',
        url: `/repos/${repo.id}/project-docs/content`,
        payload: { path: 'docs/a.md', text: oversized },
      });
      expect(res.statusCode).toBe(413);

      const fsp = await import('node:fs/promises');
      const content = await fsp.readFile(join(cloneDir, 'docs/a.md'), 'utf8');
      expect(content).toBe('original');
      await app.close();
    });
  });
});
