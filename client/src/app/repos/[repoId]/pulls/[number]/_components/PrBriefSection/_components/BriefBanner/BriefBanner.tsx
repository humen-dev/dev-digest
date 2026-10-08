"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, CircularScore, Icon } from "@devdigest/ui";
import type { BriefProvenance, ReviewRecord } from "@devdigest/shared";
import { formatCost } from "@/lib/format-cost";
import { relativeTime } from "@/lib/relative-time";
import { VERDICT_COLOR, VERDICT_LABEL_KEY } from "../../constants";
import { reviewBlockers } from "../../helpers";
import { s } from "../../styles";

interface BriefBannerProps {
  summary: string;
  provenance: BriefProvenance;
  /** Latest `kind: 'review'` record; null → no verdict block. */
  review: ReviewRecord | null;
  /** "Outdated (a1b2c3d → f00ba12)" or null when the brief matches the head. */
  outdatedLabel: string | null;
  regenerating: boolean;
  regenerateDisabled: boolean;
  onRegenerate: () => void;
}

/** Brief summary + the latest review's verdict/score + generation provenance. */
export function BriefBanner({
  summary,
  provenance,
  review,
  outdatedLabel,
  regenerating,
  regenerateDisabled,
  onRegenerate,
}: BriefBannerProps) {
  const t = useTranslations("brief");
  const tReview = useTranslations("prReview");
  const [hintOpen, setHintOpen] = React.useState(false);
  const hintId = React.useId();
  const blockers = review ? reviewBlockers(review) : 0;

  return (
    <div style={s.banner}>
      <div style={s.bannerMain}>
        <div style={s.bannerTitleRow}>
          <span style={s.bannerLabel}>{t("card.title")}</span>
          {review?.verdict && (
            <span style={{ ...s.verdictLabel, color: VERDICT_COLOR[review.verdict] }}>
              {tReview(`verdict.${VERDICT_LABEL_KEY[review.verdict]}`)}
            </span>
          )}
          {review && (
            <Badge color="var(--text-secondary)">
              {t("banner.findings", { count: review.findings.length })}
              {blockers > 0 ? ` · ${t("banner.blockers", { count: blockers })}` : ""}
            </Badge>
          )}
          {outdatedLabel && (
            <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
              {outdatedLabel}
            </Badge>
          )}
          <button
            type="button"
            style={s.hintBtn}
            aria-label={t("banner.hint")}
            aria-describedby={hintOpen ? hintId : undefined}
            onFocus={() => setHintOpen(true)}
            onBlur={() => setHintOpen(false)}
            onMouseEnter={() => setHintOpen(true)}
            onMouseLeave={() => setHintOpen(false)}
          >
            <Icon.Info size={14} />
          </button>
        </div>
        {hintOpen && (
          <div id={hintId} role="tooltip" style={s.meta}>
            {t("banner.hint")}
          </div>
        )}

        {/* Plain text on purpose: the summary is model output, never HTML/Markdown. */}
        <p style={s.summary}>{summary}</p>

        <div style={s.meta}>
          <span>{t("banner.tokens", { in: provenance.tokens_in, out: provenance.tokens_out })}</span>
          <span>{formatCost(provenance.cost_usd)}</span>
          <span>
            {t("banner.generated", { time: relativeTime(provenance.generated_at), model: provenance.model })}
          </span>
        </div>
      </div>

      {review?.score != null && (
        <div style={s.scoreCol}>
          <CircularScore score={review.score} size={52} stroke={5} />
          <span style={s.scoreLabel}>{t("banner.score", { score: review.score })}</span>
        </div>
      )}

      <Button
        kind="ghost"
        size="sm"
        icon="RefreshCw"
        aria-label={t("actions.regenerate")}
        title={t("actions.regenerate")}
        aria-busy={regenerating}
        loading={regenerating}
        disabled={regenerateDisabled}
        onClick={onRegenerate}
      />
    </div>
  );
}
