/**
 * SPEC-03 (U7) — the seeded onboarding tour for `acme/payments-api`.
 *
 * `seed()` is idempotent (re-running upserts the demo fixtures); this test
 * pins that the `onboarding` row for the demo repo follows the same rule
 * (insert-once, not insert-or-replace) and that the stored `json` is a valid
 * `TourDocument` with a non-null diagram.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { TourDocument } from '../src/modules/onboarding/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[seed-onboarding-tour] Docker not available — skipping integration tests.');
}

d('seed(): onboarding tour for acme/payments-api', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('seeding twice leaves exactly one onboarding row with a valid, grounded tour', async () => {
    await seed(pg.handle.db);
    await seed(pg.handle.db);

    const [repo] = await pg.handle.db
      .select({ id: t.repos.id })
      .from(t.repos)
      .where(eq(t.repos.fullName, 'acme/payments-api'));
    expect(repo).toBeDefined();

    const rows = await pg.handle.db
      .select()
      .from(t.onboarding)
      .where(eq(t.onboarding.repoId, repo!.id));
    expect(rows).toHaveLength(1);

    const row = rows[0]!;
    const tour = TourDocument.parse(row.json);
    expect(tour.architecture.diagram).not.toBeNull();
    expect(tour.critical_paths).toHaveLength(4);
    expect(tour.how_to_run).toHaveLength(4);
    expect(tour.guided_reading).toHaveLength(3);
    expect(tour.first_tasks).toHaveLength(3);
    expect(tour.first_tasks.filter((task) => task.new_file)).toHaveLength(1);
    const totalDropped = Object.values(tour.counters).reduce((sum, c) => sum + c.dropped, 0);
    expect(totalDropped).toBe(3);

    expect(row.tourCommit).toBe('a1b2c3d4e5f6');
    expect(row.model).toBe('deepseek/deepseek-v4-flash');
    expect(row.durationMs).toBe(41_000);
    expect(row.apiCostUsd).toBeNull();

    // No index state exists for this repo (EC-36): the demo repo was never
    // indexed, so "stale" decisions have nothing to compare the tour against.
    const indexState = await pg.handle.db
      .select({ repoId: t.repoIndexState.repoId })
      .from(t.repoIndexState)
      .where(eq(t.repoIndexState.repoId, repo!.id));
    expect(indexState).toHaveLength(0);
  });
});
