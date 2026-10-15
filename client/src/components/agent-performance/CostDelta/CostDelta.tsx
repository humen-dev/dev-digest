"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { formatCostDelta } from "@/lib/format-cost";
import { s } from "./styles";

/**
 * Cost change vs the previous period. A decrease is good (ok colour), an
 * increase bad (crit) — the inverse of a metric delta. Hidden unless both
 * values exist.
 */
export function CostDelta({ current, previous }: { current: number | null; previous: number | null }) {
  const t = useTranslations("agentPerformance");
  if (current == null || previous == null) return null;
  const delta = current - previous;
  return (
    <span className="tnum" style={s.delta(delta)} data-testid="cost-delta">
      {t("cost.deltaLabel", { delta: formatCostDelta(delta) })}
    </span>
  );
}
