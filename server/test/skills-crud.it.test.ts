import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { parseSkillMarkdown } from '../src/modules/skills/domain/parse-markdown.js';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { SkillsRepository } from '../src/modules/skills/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills-crud] Docker not available — skipping integration tests.');
}

/**
 * Skills CRUD + version history (A1 module) over a real Postgres instance
 * (Testcontainers, same fixture every other `*.it.test.ts` uses). Covers:
 * create/read/update/delete, the "only a body change bumps version" rule,
 * restore-creates-a-new-version (append-only), and workspace scoping.
 */
d('/skills CRUD + versions', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  const createBody = {
    name: 'Uncovered Branch Gate',
    description: 'Every new branch needs a test.',
    type: 'rubric' as const,
    body: 'Flag any if/else/catch/early-return without a covering test.',
  };

  it('POST /skills creates a skill with source=manual, version 1, and body_tokens/agent_count', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/skills', payload: createBody });
    expect(res.statusCode).toBe(201);
    const skill = res.json();
    expect(skill).toMatchObject({
      name: 'Uncovered Branch Gate',
      source: 'manual',
      version: 1,
      enabled: true,
      agent_count: 0,
    });
    expect(typeof skill.body_tokens).toBe('number');
    expect(skill.body_tokens).toBeGreaterThan(0);
    await app.close();
  });

  it('GET /skills lists it; GET /skills/:id fetches it; 404 for an unknown id', async () => {
    const app = await makeApp();
    const created = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json();

    const list = await app.inject({ method: 'GET', url: '/skills' });
    expect(list.statusCode).toBe(200);
    expect(list.json().map((s: { id: string }) => s.id)).toContain(created.id);

    const one = await app.inject({ method: 'GET', url: `/skills/${created.id}` });
    expect(one.statusCode).toBe(200);
    expect(one.json().id).toBe(created.id);

    const ghost = '00000000-0000-0000-0000-000000000000';
    expect((await app.inject({ method: 'GET', url: `/skills/${ghost}` })).statusCode).toBe(404);
    await app.close();
  });

  it('a `body` change bumps version and appends a skill_versions snapshot; a `body`-less change does not', async () => {
    const app = await makeApp();
    const skillId = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json().id as string;

    // name/description/enabled-only edits: no version bump.
    const nameOnly = await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { name: 'Renamed Gate' },
    });
    expect(nameOnly.statusCode).toBe(200);
    expect(nameOnly.json().version).toBe(1);

    const toggled = await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { enabled: false },
    });
    expect(toggled.json().version).toBe(1);
    expect(toggled.json().enabled).toBe(false);

    let versions = (
      await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })
    ).json();
    expect(versions).toHaveLength(1);

    // A body edit bumps the version and snapshots it.
    const bodyEdit = await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { body: 'New body text.' },
    });
    expect(bodyEdit.statusCode).toBe(200);
    expect(bodyEdit.json().version).toBe(2);

    versions = (await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(versions[0].body).toBe('New body text.');
    expect(versions[1].body).toBe(createBody.body);
    await app.close();
  });

  it('version_message is recorded on the snapshot a body change creates', async () => {
    const app = await makeApp();
    const skillId = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json().id as string;

    await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { body: 'Tighter body.', version_message: '  Tightened scope rule  ' },
    });

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })
    ).json();
    // Trimmed on the way in; v1 predates any message, so it stays null.
    expect(versions[0]).toMatchObject({ version: 2, message: 'Tightened scope rule' });
    expect(versions[1]).toMatchObject({ version: 1, message: null });
    await app.close();
  });

  it('a version_message is dropped when nothing bumps, and blank is stored as null', async () => {
    const app = await makeApp();
    const skillId = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json().id as string;

    // No body change → no new snapshot, so the note has nowhere to live and must
    // NOT be back-written onto the existing version.
    const noBump = await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { name: 'Renamed', version_message: 'should be ignored' },
    });
    expect(noBump.json().version).toBe(1);
    let versions = (await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })).json();
    expect(versions).toHaveLength(1);
    expect(versions[0].message).toBeNull();

    // Whitespace-only is normalised away rather than stored as ''.
    await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { body: 'Another body.', version_message: '   ' },
    });
    versions = (await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })).json();
    expect(versions[0]).toMatchObject({ version: 2, message: null });
    await app.close();
  });

  it('GET .../versions/:version/diff returns a patch vs. the current body', async () => {
    const app = await makeApp();
    const skillId = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json().id as string;
    await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { body: 'Flag any if/else/catch/early-return without a covering test. Plus more.' },
    });

    const diff = await app.inject({ method: 'GET', url: `/skills/${skillId}/versions/1/diff` });
    expect(diff.statusCode).toBe(200);
    expect(diff.json().patch).toContain('+');
    await app.close();
  });

  it('POST .../versions/:version/restore creates a NEW version with the old body (history stays append-only)', async () => {
    const app = await makeApp();
    const skillId = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json().id as string;
    await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { body: 'A completely different body.' },
    });

    const restored = await app.inject({
      method: 'POST',
      url: `/skills/${skillId}/versions/1/restore`,
    });
    expect(restored.statusCode).toBe(200);
    const restoredSkill = restored.json();
    expect(restoredSkill.version).toBe(3);
    expect(restoredSkill.body).toBe(createBody.body);

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })
    ).json();
    // All three snapshots survive — restore never rewrites history.
    expect(versions.map((v: { version: number }) => v.version)).toEqual([3, 2, 1]);
    // A restore is not an authored edit, so it records no version message.
    expect(versions[0].message).toBeNull();
    expect(versions[1].body).toBe('A completely different body.');
    expect(versions[2].body).toBe(createBody.body);
    await app.close();
  });

  it('DELETE /skills/:id removes it (agent_skills cascade); a second delete 404s', async () => {
    const app = await makeApp();
    const skillId = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json().id as string;

    const del = await app.inject({ method: 'DELETE', url: `/skills/${skillId}` });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toEqual({ ok: true });

    expect((await app.inject({ method: 'GET', url: `/skills/${skillId}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/skills/${skillId}` })).statusCode).toBe(404);
    await app.close();
  });

  it('POST /skills/tokens counts tokens for an arbitrary (unsaved) body', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/skills/tokens',
      payload: { body: 'Some skill body text to count.' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().tokens).toBeGreaterThan(0);
    await app.close();
  });

  it('skills are workspace-scoped: another tenant cannot read, update, or delete them', async () => {
    const { db } = pg.handle;
    const [otherWs] = await db.insert(t.workspaces).values({ name: 'other-skills-ws' }).returning();
    const repo = new SkillsRepository(db);
    const foreign = await repo.insert({
      workspaceId: otherWs!.id,
      name: 'Foreign Skill',
      description: 'desc',
      type: 'custom',
      body: 'body',
    });

    const app = await makeApp();
    expect((await app.inject({ method: 'GET', url: `/skills/${foreign.id}` })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'PUT', url: `/skills/${foreign.id}`, payload: { name: 'x' } }))
        .statusCode,
    ).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/skills/${foreign.id}` })).statusCode).toBe(
      404,
    );

    const list = await app.inject({ method: 'GET', url: '/skills' });
    expect(list.json().map((s: { id: string }) => s.id)).not.toContain(foreign.id);

    // Sanity: the foreign skill really is still there in its own workspace.
    const [stillThere] = await db.select().from(t.skills).where(eq(t.skills.id, foreign.id));
    expect(stillThere).toBeDefined();
    await app.close();
  });
  it('seeds a real imported file linked to API Contract Reviewer, without duplicate skills on reseed', async () => {
    const file = readFileSync(new URL('../../docs/skill-fixtures/breaking-change.md', import.meta.url), 'utf8');
    const { draft } = parseSkillMarkdown(file, 'breaking-change.md');
    await seed(pg.handle.db);
    const rows = await pg.handle.db.select().from(t.skills).where(eq(t.skills.name, draft.name));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ...draft, source: 'imported_file' });
    const links = await pg.handle.db.select({ name: t.agents.name }).from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agents.id, t.agentSkills.agentId))
      .where(eq(t.agentSkills.skillId, rows[0]!.id));
    expect(links).toContainEqual({ name: 'API Contract Reviewer' });
  });

});
