"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TourSectionKind } from "@devdigest/shared";
import { useGenerateTour, useOnboardingTour } from "@/lib/hooks/onboarding-tour";
import { useResyncRepoIntel } from "@/lib/hooks/repo-intel";
import { TOUR_SECTION_ORDER } from "../TourSections";

type SectionEls = Partial<Record<TourSectionKind, HTMLElement>>;

function allExpanded(): Record<TourSectionKind, boolean> {
  const out = {} as Record<TourSectionKind, boolean>;
  for (const kind of TOUR_SECTION_ORDER) out[kind] = true;
  return out;
}

function asSectionKind(hash: string): TourSectionKind | null {
  return (TOUR_SECTION_ORDER as readonly string[]).includes(hash) ? (hash as TourSectionKind) : null;
}

/**
 * Orchestration state for the tour page: data fetching, section
 * expand/collapse (AC-3, AC-5), the highlighted section (AC-8, used by the
 * TOC and by "Share link") and the URL-fragment deep link on first load
 * (AC-9, EC-23). TourToc owns the IntersectionObserver itself (it only needs
 * the registered elements and a setter); this hook just holds the result so
 * TourHeader's Share link can read it too.
 */
export function useTourView(repoId: string) {
  const tourQuery = useOnboardingTour(repoId);
  const generate = useGenerateTour(repoId);
  const resync = useResyncRepoIntel(repoId);

  const [expanded, setExpanded] = useState<Record<TourSectionKind, boolean>>(allExpanded);
  const [activeKind, setActiveKind] = useState<TourSectionKind>(TOUR_SECTION_ORDER[0]);
  const sectionRefs = useRef<SectionEls>({});
  const didInitFragment = useRef(false);

  const registerSection = useCallback((kind: TourSectionKind, el: HTMLElement | null) => {
    if (el) sectionRefs.current[kind] = el;
    else delete sectionRefs.current[kind];
  }, []);

  const toggleSection = useCallback((kind: TourSectionKind) => {
    setExpanded((prev) => ({ ...prev, [kind]: !prev[kind] }));
  }, []);

  /** Expand + scroll a section into view, same for a TOC click (AC-6, AC-7)
   *  and for the fragment-on-mount effect below (AC-9). */
  const selectSection = useCallback((kind: TourSectionKind, options?: { setHash?: boolean }) => {
    setExpanded((prev) => ({ ...prev, [kind]: true }));
    setActiveKind(kind);
    sectionRefs.current[kind]?.scrollIntoView();
    if (options?.setHash !== false) {
      window.history.replaceState(null, "", `#${kind}`);
    }
  }, []);

  const tour = tourQuery.data?.tour ?? null;
  useEffect(() => {
    if (!tour || didInitFragment.current) return;
    didInitFragment.current = true;
    const kind = asSectionKind(window.location.hash.slice(1));
    // EC-23: an unknown fragment opens the page at the top without an error.
    if (kind) selectSection(kind, { setHash: false });
  }, [tour, selectSection]);

  return {
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
  };
}
