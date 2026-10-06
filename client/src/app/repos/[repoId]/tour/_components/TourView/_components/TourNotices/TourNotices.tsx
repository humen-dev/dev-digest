/* TourNotices — the banners shown above the stored tour: staleness (AC-68),
   a generation already in flight (EC-8) and a failed generation (EC-11).
   Renders nothing when none apply. */
"use client";

import { useTranslations } from "next-intl";
import { Badge, Button } from "@devdigest/ui";
import { s } from "./styles";

export interface TourNoticesProps {
  stale: boolean;
  tourCommit: string;
  currentCommit: string | null;
  onRegenerate: () => void;
  regenerating: boolean;
  conflict: boolean;
  errorMessage: string | null;
  onRetry: () => void;
}

export function TourNotices({
  stale,
  tourCommit,
  currentCommit,
  onRegenerate,
  regenerating,
  conflict,
  errorMessage,
  onRetry,
}: TourNoticesProps) {
  const t = useTranslations("onboarding");

  if (!(stale && currentCommit) && !conflict && !errorMessage) return null;

  return (
    <div style={s.stack}>
      {stale && currentCommit && (
        <div role="status" style={s.notice}>
          <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
            {t("stale.banner", { from: tourCommit.slice(0, 7), to: currentCommit.slice(0, 7) })}
          </Badge>
          <Button
            kind="ghost"
            size="sm"
            icon="RefreshCw"
            loading={regenerating}
            disabled={regenerating}
            onClick={onRegenerate}
          >
            {regenerating ? t("actions.generating") : t("actions.regenerate")}
          </Button>
        </div>
      )}
      {conflict && (
        <div role="status" style={s.notice}>
          <Badge icon="Clock">{t("inProgress")}</Badge>
        </div>
      )}
      {errorMessage && (
        <div role="alert" style={s.notice}>
          <Badge color="var(--crit)" bg="var(--crit-bg)" icon="AlertOctagon">
            {errorMessage}
          </Badge>
          <Button kind="ghost" size="sm" icon="RefreshCw" onClick={onRetry}>
            {t("actions.retry")}
          </Button>
        </div>
      )}
    </div>
  );
}
