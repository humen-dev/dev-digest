import { z } from 'zod';
import { OnboardingTour, TourComplexity } from '@devdigest/shared';

/** Stored in onboarding.json. */
export const TourDocument = OnboardingTour.pick({
  tracked_file_count: true,
  indexed_file_count: true,
  architecture: true,
  critical_paths: true,
  how_to_run: true,
  guided_reading: true,
  first_tasks: true,
  counters: true,
});
export type TourDocument = z.infer<typeof TourDocument>;

/** Model output — one completeStructured call. '' means "none". */
export const TourDraft = z.object({
  overview: z.string(),
  diagram: z.string(),
  critical_paths: z.array(z.object({ path: z.string(), note: z.string() })),
  how_to_run: z.array(z.object({ command: z.string(), note: z.string() })),
  guided_reading: z.array(z.object({ path: z.string(), reason: z.string() })),
  first_tasks: z.array(
    z.object({ title: z.string(), target: z.string(), complexity: TourComplexity }),
  ),
});
export type TourDraft = z.infer<typeof TourDraft>;

export const TOUR_DRAFT_SCHEMA_NAME = 'OnboardingTourDraft';

/** POSIX path, blob bytes. */
export interface TrackedFile {
  path: string;
  size: number;
}

export interface InputFile {
  path: string;
  text: string;
}

export interface PromptInput {
  repoName: string;
  tree: string[];
  excerpts: InputFile[];
  commandFiles: InputFile[];
}
