"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { s } from "./styles";

/** Honest-cost footnotes: the provider label is always shown; the others only when they apply. */
export function CostNotes({ unpricedRuns, pricedCiRuns = 0 }: { unpricedRuns: number; pricedCiRuns?: number }) {
  const t = useTranslations("agentPerformance");
  return (
    <div style={s.notes}>
      <span>{t("cost.label")}</span>
      {unpricedRuns > 0 && <span>{t("cost.unpriced", { count: unpricedRuns })}</span>}
      {pricedCiRuns > 0 && <span>{t("cost.ciEstimate")}</span>}
    </div>
  );
}
