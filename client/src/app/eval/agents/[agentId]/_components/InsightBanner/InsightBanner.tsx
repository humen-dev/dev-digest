/* InsightBanner — one-line summary of the largest metric move between the two latest
   runs (AC-69, AC-70, EC-23). The server sends null when the move rounds to 0 pt; then
   nothing is rendered. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalBanner } from "@devdigest/shared";
import { bannerPoints, METRIC_LABEL_KEY } from "./helpers";
import { s } from "./styles";

export function InsightBanner({ banner }: { banner: EvalBanner | null }) {
  const t = useTranslations("eval");
  if (!banner) return null;
  const points = bannerPoints(banner.points);
  if (points === 0) return null;

  const values = {
    metric: t(METRIC_LABEL_KEY[banner.metric]),
    direction: banner.direction,
    points,
    version: banner.agent_version,
  };
  const text =
    banner.transitions.length > 0
      ? t("insight.withCases", { ...values, cases: banner.transitions.map((x) => x.name).join(", ") })
      : t("insight.noCases", values);

  return (
    <div role="note" style={s.banner(banner.direction)}>
      {text}
    </div>
  );
}
