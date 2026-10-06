/* TourView — the Onboarding Tour page (SPEC-03). Fetches the tour state and
   renders the state machine in strict priority order: loading skeleton
   (EC-25) → load error (EC-26) → a stored tour (header + notices +
   sections + TOC + footer) → not cloned (EC-1) → not index-ready (EC-35) →
   the AC-29 empty state, or EC-11's failure variant of it. Gating the error
   branch on `!state` rather than an `isError` flag is what keeps a stored
   tour visible through a failed background refetch (EC-27): TanStack Query
   keeps the last successful `data` on a background error, it only flips
   `isError` — see `useOnboardingTour`'s EC-27 test in
   `src/lib/hooks/onboarding-tour.test.ts` and the client INSIGHTS.md entry
   on the same gotcha. Presentational sections are U4's TourSections; this
   unit owns the orchestration around them. */
"use client";

import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { TourSectionKind } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ApiError } from "@/lib/api";
import { formatCost } from "@/lib/format-cost";
import { TourSections, TOUR_SECTION_ORDER } from "../TourSections";
import { TourHeader } from "./_components/TourHeader";
import { TourToc } from "./_components/TourToc";
import { TourNotices } from "./_components/TourNotices";
import { useTourView } from "./hooks";
import { isIndexReady, notReadyReason, totalDropped } from "./helpers";
import { s } from "./styles";

export function TourView({ repoId }: { repoId: string }) {
  const t = useTranslations("onboarding");
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const {
    tourQuery,
    generate,
    resync,
    expanded,
    toggleSection,
    registerSection,
    sectionRefs,
    activeKind,
    setActiveKind,
    selectSection,
  } = useTourView(repoId);

  const repoFullName = activeRepo?.full_name ?? repoId;
  const repoName = activeRepo?.name ?? repoFullName;
  const crumb = [{ label: repoFullName, mono: true }, { label: t("crumb") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const state = tourQuery.data;
  const tour = state?.tour ?? null;
  const isConflict = generate.isError && generate.error instanceof ApiError && generate.error.status === 409;
  const generateErrorMessage =
    generate.isError && !isConflict
      ? generate.error instanceof ApiError
        ? generate.error.message
        : String(generate.error)
      : null;
  const generating = generate.isPending || !!state?.generating;
  const sectionTitles = Object.fromEntries(
    TOUR_SECTION_ORDER.map((kind) => [kind, t(`sections.${kind}`)]),
  ) as Record<TourSectionKind, string>;

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <h1 style={s.heading}>{t("heading", { repoName })}</h1>

        {tourQuery.isLoading ? (
          <div style={s.loadingStack}>
            <Skeleton height={20} width={320} />
            <Skeleton height={160} />
            <Skeleton height={160} />
          </div>
        ) : !state ? (
          <ErrorState title={t("loadError.title")} onRetry={() => tourQuery.refetch()} />
        ) : tour ? (
          <div style={s.layout}>
            <TourToc
              kinds={TOUR_SECTION_ORDER}
              activeKind={activeKind}
              onSelect={selectSection}
              sectionRefs={sectionRefs}
              onActiveChange={setActiveKind}
            />
            <div style={s.main}>
              <TourHeader
                tour={tour}
                cloned={state.cloned}
                generating={generating}
                onRegenerate={() => generate.mutate()}
                repoId={repoId}
                repoName={repoName}
                activeKind={activeKind}
                sectionTitles={sectionTitles}
              />
              <TourNotices
                stale={state.stale}
                tourCommit={tour.tour_commit}
                currentCommit={state.current_commit}
                onRegenerate={() => generate.mutate()}
                regenerating={generating}
                conflict={isConflict}
                errorMessage={generateErrorMessage}
                onRetry={() => generate.mutate()}
              />
              <TourSections
                tour={tour}
                repoFullName={repoFullName}
                cloned={state.cloned}
                expanded={expanded}
                onToggle={toggleSection}
                registerSection={registerSection}
              />
              <p style={s.footer}>
                {t("footer", {
                  model: tour.model,
                  cost: formatCost(tour.api_cost_usd),
                  seconds: Math.round(tour.duration_ms / 1000),
                  dropped: totalDropped(tour.counters),
                })}
              </p>
            </div>
          </div>
        ) : !state.cloned ? (
          <EmptyState icon="GitBranch" title={t("notCloned.title")} body={t("notCloned.body")} />
        ) : !isIndexReady(state.index_status) ? (
          <EmptyState
            icon="Activity"
            title={t(`notReady.${notReadyReason(state.index_status)}`)}
            cta={t("actions.reanalyze")}
            onCta={() => resync.mutate()}
            ctaLoading={resync.isPending}
          />
        ) : generateErrorMessage ? (
          <ErrorState body={generateErrorMessage} onRetry={() => generate.mutate()} />
        ) : (
          <EmptyState
            icon="Workflow"
            title={t("generate.title")}
            body={t("generate.body")}
            cta={t("generate.cta")}
            onCta={() => generate.mutate()}
            ctaLoading={generate.isPending}
          />
        )}
      </div>
    </AppShell>
  );
}
