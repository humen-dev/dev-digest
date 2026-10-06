import type { OnboardingTour } from '@devdigest/shared';
import { TourDocument } from './types.js';
import type { TourRow } from './ports.js';

/**
 * Row ⇄ contract mapping for the onboarding-tour module. `null` on a legacy
 * row (pre-tour columns never set) or a schema mismatch — e.g. an old
 * `{ sections: [...] }` shape from before SPEC-03 (EC-19). Defense-in-depth:
 * `row.json` is `unknown` (the `onboarding.json` column has no `$type`), so
 * this is the one place that actually validates it against `TourDocument`.
 */
export function toOnboardingTour(row: TourRow): OnboardingTour | null {
  if (row.tourCommit === null || row.model === null || row.durationMs === null) return null;
  const parsed = TourDocument.safeParse(row.json);
  if (!parsed.success) return null;
  const doc = parsed.data;
  return {
    repo_id: row.repoId,
    tour_commit: row.tourCommit,
    generated_at: row.generatedAt.toISOString(),
    tracked_file_count: doc.tracked_file_count,
    indexed_file_count: doc.indexed_file_count,
    model: row.model,
    api_cost_usd: row.apiCostUsd,
    duration_ms: row.durationMs,
    architecture: doc.architecture,
    critical_paths: doc.critical_paths,
    how_to_run: doc.how_to_run,
    guided_reading: doc.guided_reading,
    first_tasks: doc.first_tasks,
    counters: doc.counters,
  };
}
