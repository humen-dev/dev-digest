import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { CodeIndex, CodeMatch } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';
import { renderSkillBlocks } from '../src/modules/reviews/helpers.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions] Docker not available — skipping integration tests.');
}

const ERRORS = [
  "export class NotFoundError extends AppError {",
  "  constructor(msg = 'Not found') { super('not_found', msg, 404); }",
  '}',
  '',
  'export class ConfigError extends AppError {',
  "  constructor(msg: string) { super('config_error', msg, 500); }",
  '}',
].join('\n');
const ROUTES = "import { getContext } from '../_shared/context.js';\nexport default async function routes() {}";

const extraction = (conventions: unknown[]) => ({ ConventionExtraction: { conventions } });
const ERROR_RULE = {
  rule: 'Domain errors extend AppError with a stable code',
  rationale: 'Flag thrown Error instances in services.',
  evidence_path: 'src/errors.ts',
  evidence_line: 5,
  evidence_snippet: 'export class ConfigError extends AppError {',
  grep_literal: 'extends AppError',
  category: 'error_handling',
  confidence: 0.9,
};
const INVENTED = {
  rule: 'Handlers use the withAuth() decorator',
  rationale: null,
  evidence_path: 'src/routes.ts',
  evidence_line: 1,
  evidence_snippet: 'export default withAuth(async function routes() {})',
  grep_literal: null,
  category: 'api',
  confidence: 0.95,
};
const CONTEXT_RULE = {
  rule: 'Routes resolve the workspace through getContext()',
  rationale: null,
  evidence_path: 'src/routes.ts',
  evidence_line: 1,
  evidence_snippet: "import { getContext } from '../_shared/context.js';",
  grep_literal: 'getContext(',
  category: 'structure',
  confidence: 0.8,
};

d('conventions extractor (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let clonedRepoId: string;
  let payments: string;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'billing', fullName: 'acme/billing', clonePath: '/mock/clones/acme/billing' })
      .returning();
    clonedRepoId = repo!.id;
    const [p] = await pg.handle.db.select().from(t.repos).where(eq(t.repos.fullName, 'acme/payments-api'));
    payments = p!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp(conventions: unknown[]) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const repoIntel = {
      getConventionSamples: async () => ['src/errors.ts', 'src/routes.ts'],
      getRankedPaths: async () => [],
    } as unknown as RepoIntel;
    const codeIndex: CodeIndex = {
      grep: async (_repo, pattern): Promise<CodeMatch[]> =>
        pattern.includes('AppError')
          ? [1, 2, 3, 4].map((i) => ({ path: `src/e${i}.ts`, line: 1, text: 'x' }))
          : [{ path: 'src/routes.ts', line: 1, text: 'x' }, { path: 'src/other.ts', line: 3, text: 'x' }],
      symbols: async () => [],
      references: async () => [],
    };
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ files: { 'src/errors.ts': ERRORS, 'src/routes.ts': ROUTES } }),
        github: new MockGitHubClient(),
        llm: { openrouter: new MockLLMProvider('openai', { structuredBySchema: extraction(conventions) }) as never },
        repoIntel,
        codeIndex,
      },
    });
  }

  it('the seeded payments-api board has 3 accepted conventions and a past scan', async () => {
    const app = await makeApp([]);
    const res = await app.inject({ method: 'GET', url: `/repos/${payments}/conventions` });
    expect(res.statusCode).toBe(200);
    const board = res.json();
    expect(board.candidates).toHaveLength(3);
    expect(board.candidates.every((c: { status: string }) => c.status === 'accepted')).toBe(true);
    expect(board.last_scan).toMatchObject({ kept: 3 });
    await app.close();
  });

  it('extract on the un-cloned seed repo → 422 repo_not_cloned', async () => {
    const app = await makeApp([]);
    const res = await app.inject({ method: 'POST', url: `/repos/${payments}/conventions/extract` });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('repo_not_cloned');
    await app.close();
  });

  it('scan → triage → re-scan → draft → create skill → link to an agent', async () => {
    let app = await makeApp([ERROR_RULE, INVENTED, CONTEXT_RULE]);

    // First scan: the invented candidate is dropped by the evidence gate; persisted.
    let res = await app.inject({ method: 'POST', url: `/repos/${clonedRepoId}/conventions/extract` });
    expect(res.statusCode).toBe(200);
    let board = res.json();
    expect(board.last_scan).toMatchObject({ proposed: 3, dropped_ungrounded: 1, kept: 2, api_cost_usd: 0.001 });
    const byRule = (rule: string) => board.candidates.find((c: { rule: string }) => c.rule === rule);
    const errorRule = byRule(ERROR_RULE.rule);
    const contextRule = byRule(CONTEXT_RULE.rule);
    expect(errorRule).toMatchObject({ status: 'pending', evidence_line: 5, occurrences: 4 });
    expect(byRule(INVENTED.rule)).toBeUndefined();

    // Accept one, reject + inline-edit the other.
    res = await app.inject({ method: 'PATCH', url: `/conventions/${errorRule.id}`, payload: { status: 'accepted' } });
    expect(res.statusCode).toBe(200);
    res = await app.inject({
      method: 'PATCH',
      url: `/conventions/${contextRule.id}`,
      payload: { status: 'rejected', rationale: 'We do not want this one' },
    });
    expect(res.json()).toMatchObject({ status: 'rejected', rationale: 'We do not want this one' });

    // Persisted: a fresh read (≈ page reload) sees the same triage state.
    res = await app.inject({ method: 'GET', url: `/repos/${clonedRepoId}/conventions` });
    expect(res.json().candidates.map((c: { status: string }) => c.status).sort()).toEqual(['accepted', 'rejected']);
    await app.close();

    // Re-scan proposing a near-duplicate of the rejected rule: dropped, decisions kept.
    app = await makeApp([{ ...CONTEXT_RULE, rule: 'Route handlers resolve the workspace via getContext()' }]);
    res = await app.inject({ method: 'POST', url: `/repos/${clonedRepoId}/conventions/extract` });
    board = res.json();
    expect(board.last_scan).toMatchObject({ proposed: 1, dropped_duplicate: 1, kept: 0 });
    expect(board.candidates.map((c: { status: string }) => c.status).sort()).toEqual(['accepted', 'rejected']);

    // Draft merges only accepted rows.
    res = await app.inject({ method: 'POST', url: `/repos/${clonedRepoId}/conventions/skill-draft`, payload: {} });
    expect(res.statusCode).toBe(200);
    const draft = res.json();
    expect(draft).toMatchObject({ name: 'billing-conventions', type: 'convention', convention_ids: [errorRule.id] });
    expect(draft.body).toContain(ERROR_RULE.rule);
    expect(draft.body).not.toContain(CONTEXT_RULE.rule);

    // Create ONE skill from the (edited) draft.
    res = await app.inject({
      method: 'POST',
      url: `/repos/${clonedRepoId}/conventions/skill`,
      payload: { ...draft, body: `${draft.body}\nEdited by the maintainer.` },
    });
    expect(res.statusCode).toBe(201);
    const skill = res.json();
    expect(skill).toMatchObject({ name: 'billing-conventions', source: 'extracted', version: 1, evidence_files: ['src/errors.ts'] });

    // It shows up in the Skills list …
    res = await app.inject({ method: 'GET', url: '/skills' });
    expect(res.json().map((s: { id: string }) => s.id)).toContain(skill.id);

    // … and once linked on the agent's Skills tab, it is a block in that agent's prompt.
    const [agent] = await pg.handle.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'General Reviewer')));
    res = await app.inject({ method: 'POST', url: `/agents/${agent!.id}/skills`, payload: { skill_id: skill.id } });
    expect(res.statusCode).toBe(200);
    const blocks = renderSkillBlocks(await app.container.agentsRepo.linkedSkills(agent!.id));
    expect(blocks.some((b) => b.startsWith('### Skill: billing-conventions (convention)'))).toBe(true);
    await app.close();
  });

  it('refuses to build a skill from a non-accepted convention', async () => {
    const app = await makeApp([]);
    const [rejected] = await pg.handle.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.repoId, clonedRepoId), eq(t.conventions.status, 'rejected')));
    const res = await app.inject({
      method: 'POST',
      url: `/repos/${clonedRepoId}/conventions/skill`,
      payload: { name: 'x', description: 'y', type: 'convention', enabled: true, body: 'b', convention_ids: [rejected!.id] },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('conventions_not_accepted');
    await app.close();
  });

  it('is workspace-scoped', async () => {
    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'other' }).returning();
    const [otherRepo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: otherWs!.id, owner: 'o', name: 'r', fullName: 'o/r', clonePath: '/x' })
      .returning();
    const app = await makeApp([]);
    const res = await app.inject({ method: 'GET', url: `/repos/${otherRepo!.id}/conventions` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
