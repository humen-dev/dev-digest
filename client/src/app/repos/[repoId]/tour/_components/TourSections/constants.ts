import type { IconName } from "@devdigest/ui";
import type { TourSectionKind } from "@devdigest/shared";

/** Display order of the five tour sections (SPEC-03 catalogue order). Cannot
 *  derive this from the `TourSectionKind` zod enum at runtime — importing the
 *  enum VALUE (not just the type) from `@devdigest/shared` pulls the vendored
 *  barrel into the webpack bundle and breaks `next build` (see client
 *  INSIGHTS.md, "Recurring Errors & Fixes", 2026-09-27). */
export const TOUR_SECTION_ORDER = [
  "architecture_overview",
  "critical_paths",
  "how_to_run",
  "guided_reading",
  "first_tasks",
] as const satisfies readonly TourSectionKind[];

/** One icon per section header (SectionCard). */
export const SECTION_ICON: Record<TourSectionKind, IconName> = {
  architecture_overview: "Workflow",
  critical_paths: "Activity",
  how_to_run: "Command",
  guided_reading: "ListChecks",
  first_tasks: "Target",
};
