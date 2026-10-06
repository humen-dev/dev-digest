/* DocsEmptyState — the four non-row states a Context tab's document list can
   be in: the repo isn't cloned (EC-1), the list failed to load (EC-7), the
   filter matched nothing (EC-10), or there are no documents at all (EC-21,
   EC-22). Thin wrapper over @devdigest/ui's ErrorState/EmptyState so every
   caller gets the same taxonomy (icon, retry vs cta) instead of hand-rolling
   one. */
"use client";

import React from "react";
import { EmptyState, ErrorState, type IconName } from "@devdigest/ui";

export type DocsEmptyKind = "not-cloned" | "error" | "empty" | "no-match";

export function DocsEmptyState({
  kind,
  title,
  body,
  ctaLabel,
  onCta,
  icon,
}: {
  kind: DocsEmptyKind;
  title: string;
  body?: string;
  ctaLabel?: string;
  onCta?: () => void;
  icon?: IconName;
}) {
  if (kind === "error") return <ErrorState title={title} body={body} onRetry={onCta} />;
  return <EmptyState icon={icon} title={title} body={body} cta={ctaLabel} onCta={onCta} />;
}
