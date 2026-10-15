"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { isSmallSample } from "@/lib/accept-rate";
import { s } from "./styles";

/** "Small sample (n=3)" for 1..4 decided findings; nothing for 0 or ≥ 5. */
export function SmallSampleBadge({ decided }: { decided: number }) {
  const t = useTranslations("agentPerformance");
  if (!isSmallSample(decided)) return null;
  return <span style={s.badge}>{t("table.smallSample", { n: decided })}</span>;
}
