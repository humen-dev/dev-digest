"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ratePercent } from "@/lib/accept-rate";
import { RING_RADIUS, RING_SIZE, RING_STROKE } from "./constants";
import { s } from "./styles";

const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * Accept-rate ring with the "accepted / decided decisions" caption. With no
 * decisions the rate is unknown: the ring is empty and reads "—" (never 0%).
 */
export function AcceptRateRing({
  accepted,
  decided,
  rate,
}: {
  accepted: number;
  decided: number;
  rate: number | null;
}) {
  const t = useTranslations("agentPerformance");
  const known = rate != null && decided > 0;
  const percent = known ? ratePercent(rate) : null;
  const filled = known ? Math.min(Math.max(rate, 0), 1) * CIRCUMFERENCE : 0;
  const name = percent != null ? t("kpi.ringLabel", { rate: percent }) : t("kpi.ringEmpty");

  return (
    <div style={s.wrap}>
      <svg width={RING_SIZE} height={RING_SIZE} role="img" aria-label={name} style={s.svg}>
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          stroke="var(--border)"
          strokeWidth={RING_STROKE}
        />
        {known && (
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${CIRCUMFERENCE}`}
            transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
          />
        )}
      </svg>
      <div>
        <div className="tnum" style={s.value}>
          {percent != null ? `${percent}%` : "—"}
        </div>
        <div style={s.caption}>
          {decided > 0 ? t("kpi.decisions", { accepted, decided }) : t("states.zeroDecisions")}
        </div>
      </div>
    </div>
  );
}
