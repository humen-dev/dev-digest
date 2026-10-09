/**
 * SPEC-05 AC-76 — `seed()` gives the Security Reviewer 7 eval cases frozen from
 * PR #482's real `pr_files.patch`. Throwaway Postgres (Testcontainers); gated on
 * Docker like the other `*.it.test.ts` files.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { EvalExpectation } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import { seedEvalCases, SEED_EVAL_CASES } from '../src/db/seed-eval-cases.js';
import * as t from '../src/db/schema.js';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import { containsSecretValue } from '../src/modules/_shared/secrets.js';
import { expectationIntersectsHunk } from '../src/modules/eval/domain/frozen-input.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[eval-seed] Docker not available — skipping integration tests.');
}

d('seed(): Security Reviewer eval cases (AC-76)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let agentId: string;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    const [agent] = await pg.handle.db
      .select({ id: t.agents.id })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'Security Reviewer')));
    agentId = agent!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const casesOf = (owner: string) =>
    pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.ownerId, owner));

  it('seeds 7 cases of both types and re-seeding adds none', async () => {
    const before = await casesOf(agentId);
    expect(before).toHaveLength(7);

    await seed(pg.handle.db);
    await seed(pg.handle.db);

    const after = await casesOf(agentId);
    expect(after).toHaveLength(7);
    expect(after.map((c) => c.id).sort()).toEqual(before.map((c) => c.id).sort());
    // No other agent got cases.
    expect(await pg.handle.db.select().from(t.evalCases)).toHaveLength(7);

    const types = after.map((c) => EvalExpectation.parse(c.expectedOutput).type);
    expect(types.filter((x) => x === 'must_find').length).toBeGreaterThanOrEqual(3);
    expect(types.filter((x) => x === 'must_not_flag').length).toBeGreaterThanOrEqual(3);
    expect(after.every((c) => c.ownerKind === 'agent' && c.sourceFindingId === null)).toBe(true);
  });

  it('every expectation intersects a hunk of the REAL pr_files.patch of PR #482', async () => {
    const [pr] = await pg.handle.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.number, 482)));
    const files = await pg.handle.db.select().from(t.prFiles).where(eq(t.prFiles.prId, pr!.id));
    const byPath = new Map(files.map((f) => [f.path, f.patch as string]));

    for (const c of SEED_EVAL_CASES) {
      const e = c.expectation;
      const patch = byPath.get(e.file);
      expect(patch, `${e.file} has a patch`).toBeTruthy();
      const live = parseUnifiedDiff([`diff --git a/${e.file} b/${e.file}`, `--- a/${e.file}`, `+++ b/${e.file}`, patch!].join('\n'));
      expect(expectationIntersectsHunk(live, e), `${c.name} vs the live patch`).toBe(true);
    }
  });

  it('each stored case holds only its own file, parses, and intersects its stored hunk', async () => {
    const cases = await casesOf(agentId);
    for (const row of cases) {
      const e = EvalExpectation.parse(row.expectedOutput);
      const parsed = parseUnifiedDiff(row.inputDiff);
      expect(parsed.files.map((f) => f.path)).toEqual([e.file]);
      expect(row.inputFiles).toEqual([e.file]);
      expect(expectationIntersectsHunk(parsed, e), row.name).toBe(true);
      expect(containsSecretValue(row.inputDiff)).toBe(false);
      expect(row.inputMeta).toMatchObject({ pr_number: 482, title: 'Add rate limiting to public API endpoints' });
    }
  });

  it('records the v1 prompt snapshot of the Security Reviewer (so the first Compare can show a prompt diff)', async () => {
    const [snap] = await pg.handle.db.select().from(t.agentVersions).where(eq(t.agentVersions.agentId, agentId));
    const [agent] = await pg.handle.db.select().from(t.agents).where(eq(t.agents.id, agentId));
    expect(snap).toMatchObject({ version: agent!.version });
    expect((snap!.configJson as { system_prompt: string }).system_prompt).toBe(agent!.systemPrompt);
    expect(await pg.handle.db.select().from(t.agentVersions).where(eq(t.agentVersions.agentId, agentId))).toHaveLength(1);
  });

  it('the guard is "agent has no cases yet": a user case blocks the seed; an emptied agent is re-seeded', async () => {
    const [mine] = await pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.ownerId, agentId)).limit(1);
    await pg.handle.db.delete(t.evalCases).where(and(eq(t.evalCases.ownerId, agentId)));
    await pg.handle.db.insert(t.evalCases).values({
      workspaceId,
      ownerKind: 'agent',
      ownerId: agentId,
      name: 'my-own-case',
      inputDiff: mine!.inputDiff,
      inputFiles: mine!.inputFiles,
      inputMeta: mine!.inputMeta,
      expectedOutput: mine!.expectedOutput,
    });
    expect(await seedEvalCases(pg.handle.db, workspaceId)).toBe(0);
    expect(await casesOf(agentId)).toHaveLength(1);

    await pg.handle.db.delete(t.evalCases).where(eq(t.evalCases.ownerId, agentId));
    expect(await seedEvalCases(pg.handle.db, workspaceId)).toBe(7);
    expect(await casesOf(agentId)).toHaveLength(7);
  });
});
