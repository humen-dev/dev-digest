import type { OnboardingTour, TourCounters, TourIndexStatus, TourSectionKind } from "@devdigest/shared";
import { TOUR_SECTION_ORDER } from "../TourSections";

/** "Index-ready" per EC-34/EC-35: a generation may run against `full` or
 *  `partial`; anything else (no row, `degraded`, `failed`) is not ready. */
export function isIndexReady(status: TourIndexStatus | null): boolean {
  return status === "full" || status === "partial";
}

export type NotReadyReason = "notIndexed" | "failed" | "other";

/** EC-35's three reasons: no index-state row, a failed index, or any other
 *  not-ready status (currently only `degraded`). */
export function notReadyReason(status: TourIndexStatus | null): NotReadyReason {
  if (status === null) return "notIndexed";
  if (status === "failed") return "failed";
  return "other";
}

/** AC-55's "<D> items dropped as unverified" — the sum of every section's
 *  dropped counter (architecture has none). */
export function totalDropped(counters: TourCounters): number {
  return (
    counters.critical_paths.dropped +
    counters.how_to_run.dropped +
    counters.guided_reading.dropped +
    counters.first_tasks.dropped
  );
}

/** Short commit for the stale banner and the Markdown export header. */
export function sha7(commit: string): string {
  return commit.slice(0, 7);
}

function sectionMarkdown(tour: OnboardingTour, kind: TourSectionKind, emptyText: string): string[] {
  switch (kind) {
    case "architecture_overview": {
      if (tour.architecture.overview.trim().length === 0) return [emptyText];
      const lines = [tour.architecture.overview];
      if (tour.architecture.diagram) lines.push("", "```mermaid", tour.architecture.diagram, "```");
      return lines;
    }
    case "critical_paths":
      return tour.critical_paths.length === 0
        ? [emptyText]
        : tour.critical_paths.map((item) => `- \`${item.path}\` — ${item.note}`);
    case "how_to_run":
      return tour.how_to_run.length === 0
        ? [emptyText]
        : [
            "```sh",
            ...tour.how_to_run.map((step) => (step.note ? `${step.command} # ${step.note}` : step.command)),
            "```",
          ];
    case "guided_reading":
      return tour.guided_reading.length === 0
        ? [emptyText]
        : tour.guided_reading.map((item, i) => `${i + 1}. \`${item.path}\` — ${item.reason}`);
    case "first_tasks":
      return tour.first_tasks.length === 0
        ? [emptyText]
        : tour.first_tasks.map((task) => `- **${task.title}** — \`${task.target}\` (${task.complexity})`);
    default:
      return [];
  }
}

/**
 * "Markdown export" (AC-64): the tour as one Markdown document, section
 * headings in catalogue order, the diagram as a `mermaid` fence. An empty
 * section (EC-15) gets the same "nothing verified" line shown on its card,
 * so the export never has a heading with nothing under it.
 */
export function buildTourMarkdown(
  tour: OnboardingTour,
  repoName: string,
  sectionTitles: Record<TourSectionKind, string>,
  emptyText: string,
): string {
  const lines: string[] = [
    `# Onboarding for ${repoName}`,
    "",
    `Generated from ${tour.tracked_file_count} files at ${sha7(tour.tour_commit)}`,
  ];
  for (const kind of TOUR_SECTION_ORDER) {
    lines.push("", `## ${sectionTitles[kind]}`, "", ...sectionMarkdown(tour, kind, emptyText));
  }
  return lines.join("\n");
}
