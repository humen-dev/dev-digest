/* TourSections — the five section cards of an onboarding tour, in order,
   controlled entirely by props (expand/collapse state and the TOC's scroll
   target live in the page, which also owns data fetching — this component is
   presentational, SPEC-03's AC-3/AC-5). */
"use client";

import { useTranslations } from "next-intl";
import type { OnboardingTour, TourSectionKind } from "@devdigest/shared";
import { SectionCard } from "./_components/SectionCard";
import { ArchitectureSection } from "./_components/ArchitectureSection";
import { CriticalPaths } from "./_components/CriticalPaths";
import { HowToRun } from "./_components/HowToRun";
import { GuidedReading } from "./_components/GuidedReading";
import { FirstTasks } from "./_components/FirstTasks";
import { TOUR_SECTION_ORDER, SECTION_ICON } from "./constants";
import { isSectionEmpty } from "./helpers";
import { s } from "./styles";

export interface TourSectionsProps {
  tour: OnboardingTour;
  repoFullName: string;
  cloned: boolean;
  expanded: Record<TourSectionKind, boolean>;
  onToggle: (kind: TourSectionKind) => void;
  registerSection: (kind: TourSectionKind, el: HTMLElement | null) => void;
}

function SectionBody({
  kind,
  tour,
  repoFullName,
  cloned,
}: {
  kind: TourSectionKind;
  tour: OnboardingTour;
  repoFullName: string;
  cloned: boolean;
}) {
  switch (kind) {
    case "architecture_overview":
      return (
        <ArchitectureSection
          architecture={tour.architecture}
          repoFullName={repoFullName}
          tourCommit={tour.tour_commit}
          cloned={cloned}
        />
      );
    case "critical_paths":
      return (
        <CriticalPaths
          items={tour.critical_paths}
          repoFullName={repoFullName}
          tourCommit={tour.tour_commit}
          cloned={cloned}
        />
      );
    case "how_to_run":
      return <HowToRun steps={tour.how_to_run} />;
    case "guided_reading":
      return (
        <GuidedReading
          items={tour.guided_reading}
          repoFullName={repoFullName}
          tourCommit={tour.tour_commit}
          cloned={cloned}
        />
      );
    case "first_tasks":
      return <FirstTasks tasks={tour.first_tasks} />;
    default:
      return null;
  }
}

export function TourSections({ tour, repoFullName, cloned, expanded, onToggle, registerSection }: TourSectionsProps) {
  const t = useTranslations("onboarding");

  return (
    <div style={s.stack}>
      {TOUR_SECTION_ORDER.map((kind) => (
        <SectionCard
          key={kind}
          kind={kind}
          icon={SECTION_ICON[kind]}
          title={t(`sections.${kind}`)}
          expanded={expanded[kind]}
          onToggle={() => onToggle(kind)}
          registerRef={(el) => registerSection(kind, el)}
          isEmpty={isSectionEmpty(tour, kind)}
          emptyText={t("sections.empty")}
        >
          <SectionBody kind={kind} tour={tour} repoFullName={repoFullName} cloned={cloned} />
        </SectionCard>
      ))}
    </div>
  );
}
