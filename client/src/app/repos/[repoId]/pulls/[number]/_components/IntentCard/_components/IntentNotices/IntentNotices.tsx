"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { IntentConfidence, IntentSource } from "@devdigest/shared";
import { reasonKey, shortSha } from "../../helpers";
import { s } from "../../styles";

interface IntentNoticesProps {
  stale: boolean;
  oldSha: string | null;
  newSha: string;
  confidence: IntentConfidence;
  missingContext: string[];
  unresolved: IntentSource[];
}

/** Stale / low-confidence / missing-context call-outs above the scope lists. */
export function IntentNotices({
  stale,
  oldSha,
  newSha,
  confidence,
  missingContext,
  unresolved,
}: IntentNoticesProps) {
  const t = useTranslations("brief");
  const hasMissing = missingContext.length > 0 || unresolved.length > 0;
  if (!stale && confidence !== "low" && !hasMissing) return null;

  return (
    <div style={s.notices}>
      {stale && (
        <div style={s.notice} role="status">
          <Icon.AlertTriangle size={15} style={s.noticeIcon} />
          <span>{t("intentCard.stale.body", { oldSha: shortSha(oldSha), newSha: shortSha(newSha) })}</span>
        </div>
      )}
      {confidence === "low" && (
        <div style={s.notice} role="status">
          <Icon.AlertTriangle size={15} style={s.noticeIcon} />
          <span>{t("intentCard.lowConfidence")}</span>
        </div>
      )}
      {hasMissing && (
        <div style={s.notice} role="status">
          <Icon.AlertTriangle size={15} style={s.noticeIcon} />
          <span>
            {t("intentCard.missingContext")}
            {": "}
            {[
              ...missingContext,
              ...unresolved.map((source) =>
                source.reason ? `${source.ref} (${t(`intentCard.${reasonKey(source.reason)}`)})` : source.ref,
              ),
            ].join("; ")}
          </span>
        </div>
      )}
    </div>
  );
}
