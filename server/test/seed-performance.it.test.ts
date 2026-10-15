/**
 * SPEC-09 Q1a — `seedPerformanceDemo()` on a freshly migrated + seeded Postgres
 * (Testcontainers). Gated on Docker like the other `*.it.test.ts` files.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import { seedPerformanceDemo, buildRunSpecs, DEMO_PR_TITLE } from '../src/db/seed-performance.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[seed-performance] Docker not available — skipping integration tests.');
}

describe('buildRunSpecs (pure shape of the demo data)', () => {
  const specs = buildRunSpecs();
  it('covers the scenarios the dashboard needs', () => {
    expect(specs.length).toBeGreaterThanOrEqual(40);
    expect(specs.filter((s) => s.ageH <= 24 && s.status !== 'running').length).toBeGreaterThanOrEqual(4);
    expect(specs.filter((s) => s.source === 'ci' && s.costUsd !== null && s.outcomes === null)).toHaveLength(4);
    expect(specs.filter((s) => s.status === 'done' && s.costUsd === null)).toHaveLength(2);
    expect(specs.filter((s) => s.status === 'running')).toHaveLength(1);
    expect(specs.some((s) => s.status === 'failed')).toBe(true);
    expect(specs.some((s) => s.status === 'cancelled')).toBe(true);
    expect(specs.filter((s) => s.agent === null && s.outcomes)).toHaveLength(3);
    expect(specs.filter((s) => s.ageH > 720 && s.outcomes)).toHaveLength(8);
    const a = specs.filter((s) => s.agent === 'A');
    expect(a.length).toBeGreaterThan(0);
    expect(a.every((s) => s.ageH > 720)).toBe(true);
    const sModels = new Set(specs.filter((s) => s.agent === 'S' && s.ageH <= 720).map((s) => s.model));
    expect(sModels.size).toBe(2);
  });
});

d('seedPerformanceDemo()', () => {
  let pg: PgFixture;
  let workspaceId: string;
  const now = new Date('2026-10-15T12:00:00.000Z');

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const counts = async () => {
    const db = pg.handle.db;
    return {
      runs: (await db.select().from(t.agentRuns)).length,
      reviews: (await db.select().from(t.reviews)).length,
      findings: (await db.select().from(t.findings)).length,
      prs: (await db.select().from(t.pullRequests)).length,
    };
  };

  /** Snapshot of the main-seed rows of PR #482 (runs + reviews). */
  const pr482 = async () => {
    const db = pg.handle.db;
    const [pr] = await db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.number, 482)));
    const runs = await db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, pr!.id));
    const reviews = await db.select().from(t.reviews).where(eq(t.reviews.prId, pr!.id));
    const key = <T extends { id: string }>(rows: T[]) => rows.sort((a, b) => a.id.localeCompare(b.id));
    return { runs: key(runs), reviews: key(reviews) };
  };

  it('first call inserts >= 40 runs over >= 25 distinct days; second is skipped; refresh keeps counts', async () => {
    const db = pg.handle.db;
    const before482 = await pr482();
    const baseline = await counts();

    const first = await seedPerformanceDemo(db, { now });
    expect(first.skipped).toBe(false);
    expect(first.inserted).toBeGreaterThanOrEqual(40);

    const afterFirst = await counts();
    expect(afterFirst.runs - baseline.runs).toBe(first.inserted);
    expect(afterFirst.prs - baseline.prs).toBe(1);

    const [marker] = await db.select().from(t.pullRequests).where(eq(t.pullRequests.title, DEMO_PR_TITLE));
    const demoRuns = await db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, marker!.id));
    const days = new Set(demoRuns.map((r) => r.ranAt.toISOString().slice(0, 10)));
    expect(days.size).toBeGreaterThanOrEqual(25);

    const second = await seedPerformanceDemo(db, { now });
    expect(second).toEqual({ inserted: 0, skipped: true });
    expect(await counts()).toEqual(afterFirst);

    const refreshed = await seedPerformanceDemo(db, { now, refresh: true });
    expect(refreshed).toEqual({ inserted: first.inserted, skipped: false });
    expect(await counts()).toEqual(afterFirst);

    // Main-seed rows of PR #482 are untouched by every call (Q1a).
    expect(await pr482()).toEqual(before482);
  });

  it('produces the scenario mix (unknown agent, ci runs, null cost, decisions)', async () => {
    const db = pg.handle.db;
    const [marker] = await db.select().from(t.pullRequests).where(eq(t.pullRequests.title, DEMO_PR_TITLE));
    const runs = await db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, marker!.id));

    expect(runs.filter((r) => r.agentId === null)).toHaveLength(3);
    expect(runs.filter((r) => r.source === 'ci' && r.costUsd !== null)).toHaveLength(4);
    expect(runs.filter((r) => r.status === 'done' && r.costUsd === null)).toHaveLength(2);
    expect(runs.filter((r) => r.status === 'running')).toHaveLength(1);
    expect(runs.some((r) => r.status === 'failed')).toBe(true);
    expect(runs.some((r) => r.status === 'cancelled')).toBe(true);

    const reviews = await db.select().from(t.reviews).where(eq(t.reviews.prId, marker!.id));
    expect(reviews.every((r) => r.kind === 'review' && r.runId !== null)).toBe(true);
    // The null-agent runs still have reviews.
    expect(reviews.filter((r) => r.agentId === null)).toHaveLength(3);

    const decided = await db
      .select({ id: t.findings.id })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
      .where(and(eq(t.reviews.prId, marker!.id), isNotNull(t.findings.acceptedAt)));
    const pending = await db
      .select({ id: t.findings.id })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
      .where(and(eq(t.reviews.prId, marker!.id), isNull(t.findings.acceptedAt), isNull(t.findings.dismissedAt)));
    expect(decided.length).toBeGreaterThan(0);
    expect(pending.length).toBeGreaterThan(0);
  });

  it('fails with a clear message when the main seed was not run', async () => {
    const empty = await startPg();
    try {
      await expect(seedPerformanceDemo(empty.handle.db, { now })).rejects.toThrow(/run the main seed/);
    } finally {
      await empty.stop();
    }
  });
});
