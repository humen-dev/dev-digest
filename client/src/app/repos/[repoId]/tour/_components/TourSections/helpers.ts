import type { OnboardingTour, TourSectionKind } from "@devdigest/shared";

/**
 * EC-15: "no items" per section. Architecture has no separately-countable
 * list — its diagram and path chips live inside the overview prose — so it
 * counts as empty when the overview text itself is empty; the other four
 * sections are empty when their list has no entries.
 */
export function isSectionEmpty(tour: OnboardingTour, kind: TourSectionKind): boolean {
  switch (kind) {
    case "architecture_overview":
      return tour.architecture.overview.trim().length === 0;
    case "critical_paths":
      return tour.critical_paths.length === 0;
    case "how_to_run":
      return tour.how_to_run.length === 0;
    case "guided_reading":
      return tour.guided_reading.length === 0;
    case "first_tasks":
      return tour.first_tasks.length === 0;
    default:
      return false;
  }
}
