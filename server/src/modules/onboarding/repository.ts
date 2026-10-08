import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { OnboardingTourRepositoryPort, TourRow } from './ports.js';

/** Postgres SQLSTATE for a foreign-key violation. */
const FOREIGN_KEY_VIOLATION = '23503';

function isForeignKeyViolation(err: unknown): boolean {
  return (err as { code?: string } | undefined)?.code === FOREIGN_KEY_VIOLATION;
}

/**
 * Drizzle implementation of `OnboardingTourRepositoryPort`. Owns the
 * `onboarding` table (one row per repo, `repo_id` primary key + FK).
 */
export class DrizzleOnboardingRepository implements OnboardingTourRepositoryPort {
  constructor(private db: Db) {}

  async get(repoId: string): Promise<TourRow | null> {
    const [row] = await this.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId));
    return row ?? null;
  }

  /**
   * Upsert on `repo_id` (AC-35: a second generation replaces the row, it
   * never grows). Returns `false` instead of throwing when the insert hits a
   * foreign-key violation — the repo was deleted while this generation was
   * in flight (EC-17); the caller just has nothing left to persist to.
   */
  async replace(row: TourRow): Promise<boolean> {
    const values = {
      repoId: row.repoId,
      json: row.json,
      generatedAt: row.generatedAt,
      tourCommit: row.tourCommit,
      model: row.model,
      apiCostUsd: row.apiCostUsd,
      durationMs: row.durationMs,
    };
    try {
      await this.db
        .insert(t.onboarding)
        .values(values)
        .onConflictDoUpdate({ target: t.onboarding.repoId, set: values });
      return true;
    } catch (err) {
      if (isForeignKeyViolation(err)) return false;
      throw err;
    }
  }
}
