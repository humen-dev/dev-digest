/* SectionCard — one collapsible tour section: an icon + title header button
   with `aria-expanded` (NFR-8), an id for the TOC's fragment links and
   `scrollMarginTop` so a jump-to-fragment doesn't land under any sticky chrome,
   and the EC-15 empty-section text in place of the body when it has no items. */
"use client";

import type { ReactNode } from "react";
import { Icon, type IconName } from "@devdigest/ui";
import type { TourSectionKind } from "@devdigest/shared";
import { s, chevronFor } from "./styles";

export interface SectionCardProps {
  kind: TourSectionKind;
  icon: IconName;
  title: string;
  expanded: boolean;
  onToggle: () => void;
  /** Attaches the card's DOM node so the page can scroll a TOC link into view. */
  registerRef?: (el: HTMLElement | null) => void;
  isEmpty: boolean;
  emptyText: string;
  children: ReactNode;
}

export function SectionCard({
  kind,
  icon,
  title,
  expanded,
  onToggle,
  registerRef,
  isEmpty,
  emptyText,
  children,
}: SectionCardProps) {
  const SectionIcon = Icon[icon];
  return (
    <section id={kind} ref={registerRef} style={s.card}>
      <button type="button" aria-expanded={expanded} onClick={onToggle} style={s.header}>
        <span style={s.iconWrap}>
          <SectionIcon size={16} />
        </span>
        <span style={s.title}>{title}</span>
        <Icon.ChevronRight size={16} style={chevronFor(expanded)} />
      </button>
      {expanded && <div style={s.body}>{isEmpty ? <p style={s.emptyText}>{emptyText}</p> : children}</div>}
    </section>
  );
}
