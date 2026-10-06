/* TourHeader — the subtitle line (AC-10, AC-11) plus the tour's actions:
   Regenerate (AC-30, AC-32, EC-2), Share link (AC-63) and Copy as Markdown
   (AC-64). Reuses TourSections' useCopyToClipboard so "Copy as Markdown"
   gets the same "Copied" label as every other copy control; Share link
   raises its own toast instead (AC-63 is explicit about the toast text), so
   it writes to the clipboard directly. */
"use client";

import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { OnboardingTour, TourSectionKind } from "@devdigest/shared";
import { useToast } from "@/lib/toast";
import { relativeTime } from "@/lib/relative-time";
import { useCopyToClipboard } from "../../../TourSections";
import { buildTourMarkdown } from "../../helpers";
import { s } from "./styles";

const COPY_MARKDOWN_ID = "copy-markdown";

export interface TourHeaderProps {
  tour: OnboardingTour;
  cloned: boolean;
  generating: boolean;
  onRegenerate: () => void;
  repoId: string;
  repoName: string;
  activeKind: TourSectionKind;
  sectionTitles: Record<TourSectionKind, string>;
}

export function TourHeader({
  tour,
  cloned,
  generating,
  onRegenerate,
  repoId,
  repoName,
  activeKind,
  sectionTitles,
}: TourHeaderProps) {
  const t = useTranslations("onboarding");
  const toast = useToast();
  const { copy, copiedId } = useCopyToClipboard();

  const countsDiffer = tour.tracked_file_count !== tour.indexed_file_count;
  const subtitle =
    t("subtitle", {
      files: tour.tracked_file_count.toLocaleString("en-US"),
      ago: relativeTime(tour.generated_at),
    }) +
    (countsDiffer
      ? ` ${t("subtitleIndexed", { count: tour.indexed_file_count.toLocaleString("en-US") })}`
      : "");

  const handleShare = () => {
    const url = `${window.location.origin}/repos/${repoId}/tour#${activeKind}`;
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success(t("toast.linkCopied")))
      .catch(() => toast.error(t("toast.copyFailed")));
  };

  const handleCopyMarkdown = () => {
    const markdown = buildTourMarkdown(tour, repoName, sectionTitles, t("sections.empty"));
    copy(markdown, COPY_MARKDOWN_ID);
  };

  return (
    <div style={s.row}>
      <p style={s.subtitle}>{subtitle}</p>
      <div style={s.actions}>
        {!cloned && <span style={s.hint}>{t("actions.cloneToRegenerate")}</span>}
        <Button
          kind="secondary"
          icon="RefreshCw"
          loading={generating}
          disabled={generating || !cloned}
          onClick={onRegenerate}
        >
          {generating ? t("actions.generating") : t("actions.regenerate")}
        </Button>
        <Button kind="ghost" icon="Link" onClick={handleShare}>
          {t("actions.shareLink")}
        </Button>
        <Button kind="ghost" icon="Copy" onClick={handleCopyMarkdown}>
          {copiedId === COPY_MARKDOWN_ID ? t("actions.copied") : t("actions.copyMarkdown")}
        </Button>
      </div>
    </div>
  );
}
