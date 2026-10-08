/* TourToc — the "ON THIS PAGE" list (AC-4, NFR-9). A click expands the
   target section, scrolls it into view and sets the URL fragment (AC-6,
   AC-7); an IntersectionObserver highlights the topmost visible section as
   the user scrolls (AC-8). Hidden under 768px (EC-21, manual check — jsdom
   has no real layout to assert against). */
"use client";

import { useEffect } from "react";
import type { MutableRefObject } from "react";
import { useTranslations } from "next-intl";
import type { TourSectionKind } from "@devdigest/shared";
import { s } from "./styles";

const TOC_HIDDEN_CLASS = "dd-tour-toc";

export interface TourTocProps {
  kinds: readonly TourSectionKind[];
  activeKind: TourSectionKind;
  onSelect: (kind: TourSectionKind) => void;
  sectionRefs: MutableRefObject<Partial<Record<TourSectionKind, HTMLElement>>>;
  onActiveChange: (kind: TourSectionKind) => void;
}

export function TourToc({ kinds, activeKind, onSelect, sectionRefs, onActiveChange }: TourTocProps) {
  const t = useTranslations("onboarding");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const entries = kinds
      .map((kind) => [kind, sectionRefs.current[kind]] as const)
      .filter((entry): entry is [TourSectionKind, HTMLElement] => entry[1] != null);
    if (entries.length === 0) return;

    const observer = new IntersectionObserver(
      (observed) => {
        const visible = observed.filter((entry) => entry.isIntersecting);
        if (visible.length === 0) return;
        visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const topTarget = visible[0]!.target;
        const kind = entries.find(([, el]) => el === topTarget)?.[0];
        if (kind) onActiveChange(kind);
      },
      { rootMargin: "0px 0px -70% 0px" },
    );
    entries.forEach(([, el]) => observer.observe(el));
    return () => observer.disconnect();
  }, [kinds, sectionRefs, onActiveChange]);

  return (
    <>
      <style>{`@media (max-width: 767px) { .${TOC_HIDDEN_CLASS} { display: none; } }`}</style>
      <nav aria-label={t("toc.label")} className={TOC_HIDDEN_CLASS} style={s.nav}>
        <div style={s.title}>{t("toc.title")}</div>
        <ul style={s.list}>
          {kinds.map((kind) => (
            <li key={kind}>
              <a
                href={`#${kind}`}
                aria-current={activeKind === kind ? "true" : undefined}
                style={s.link(activeKind === kind)}
                onClick={(e) => {
                  e.preventDefault();
                  onSelect(kind);
                }}
              >
                {t(`sections.${kind}`)}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
