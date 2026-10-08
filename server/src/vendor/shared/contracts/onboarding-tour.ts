import { z } from 'zod';

/**
 * Onboarding Tour (SPEC-03): a grounded five-section tour of an indexed
 * repository, plus the page state the web app reads.
 */

export const TourSectionKind = z.enum([
  'architecture_overview',
  'critical_paths',
  'how_to_run',
  'guided_reading',
  'first_tasks',
]);
export type TourSectionKind = z.infer<typeof TourSectionKind>;

export const TourComplexity = z.enum(['low', 'medium', 'high']);
export type TourComplexity = z.infer<typeof TourComplexity>;

export const TourCounter = z.object({
  proposed: z.number().int().min(0),
  dropped: z.number().int().min(0),
});
export type TourCounter = z.infer<typeof TourCounter>;

export const TourArchitecture = z.object({
  overview: z.string(), // Markdown, ≤ 1,500 chars (AC-53)
  overview_paths: z.array(z.string()), // inline code spans equal to a tracked file (AC-14)
  diagram: z.string().nullable(), // model-written Mermaid; null = none (AC-66)
});
export type TourArchitecture = z.infer<typeof TourArchitecture>;

export const TourPathItem = z.object({
  path: z.string(),
  note: z.string(),
  importer_count: z.number().int().min(0).nullable(),
});
export type TourPathItem = z.infer<typeof TourPathItem>;

export const TourReadingItem = z.object({
  path: z.string(),
  reason: z.string(),
  importer_count: z.number().int().min(0).nullable(),
});
export type TourReadingItem = z.infer<typeof TourReadingItem>;

export const TourStep = z.object({
  command: z.string(),
  note: z.string().nullable(),
  source: z.string(),
});
export type TourStep = z.infer<typeof TourStep>;

export const TourTask = z.object({
  title: z.string(),
  target: z.string(),
  complexity: TourComplexity,
  new_file: z.boolean(),
});
export type TourTask = z.infer<typeof TourTask>;

export const TourCounters = z.object({
  critical_paths: TourCounter,
  how_to_run: TourCounter,
  guided_reading: TourCounter,
  first_tasks: TourCounter,
});
export type TourCounters = z.infer<typeof TourCounters>;

export const OnboardingTour = z.object({
  repo_id: z.string(),
  tour_commit: z.string(), // last_indexed_sha at generation start (AC-38)
  generated_at: z.string(), // ISO
  tracked_file_count: z.number().int().min(0),
  indexed_file_count: z.number().int().min(0),
  model: z.string(),
  api_cost_usd: z.number().nullable(), // real provider cost only (NFR-11)
  duration_ms: z.number().int().min(0),
  architecture: TourArchitecture,
  critical_paths: z.array(TourPathItem),
  how_to_run: z.array(TourStep),
  guided_reading: z.array(TourReadingItem),
  first_tasks: z.array(TourTask),
  counters: TourCounters,
});
export type OnboardingTour = z.infer<typeof OnboardingTour>;

export const TourIndexStatus = z.enum(['full', 'partial', 'degraded', 'failed']);
export type TourIndexStatus = z.infer<typeof TourIndexStatus>;

export const OnboardingTourState = z.object({
  tour: OnboardingTour.nullable(),
  cloned: z.boolean(),
  index_status: TourIndexStatus.nullable(), // null = no repo_index_state row
  generating: z.boolean(), // generation in flight in this API process
  stale: z.boolean(), // AC-67; false without tour or index state (EC-36)
  current_commit: z.string().nullable(), // current last_indexed_sha; null = no index state
});
export type OnboardingTourState = z.infer<typeof OnboardingTourState>;
