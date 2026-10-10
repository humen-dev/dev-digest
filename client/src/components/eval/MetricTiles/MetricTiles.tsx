"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalRunMetrics } from "@devdigest/shared";
import { deltaTone, formatDeltaPoints, formatPercent } from "@/lib/eval-format";
import { s } from "./styles";

export type MetricDeltas = Partial<
  Record<"recall" | "precision" | "citation_accuracy", number | null>
>;

/**
 * Four-tile metric strip: recall, precision, citation accuracy, cases passed.
 * `deltas` are 0..1 ratio differences against a previous run (rendered as
 * signed points); omit them for a plain strip. A null metric reads "n/a".
 */
export function MetricTiles({
  metrics,
  deltas,
}: {
  metrics: EvalRunMetrics | null;
  deltas?: MetricDeltas;
}) {
  const t = useTranslations("eval");
  const na = t("metrics.notApplicable");

  const ratioTiles = [
    { key: "recall", label: t("metrics.recall"), value: metrics?.recall ?? null },
    { key: "precision", label: t("metrics.precision"), value: metrics?.precision ?? null },
    { key: "citation_accuracy", label: t("metrics.citation"), value: metrics?.citation_accuracy ?? null },
  ] as const;

  return (
    <div style={s.strip} role="group" aria-label={t("evalsTab.metricsTitle")}>
      {ratioTiles.map((tile) => {
        const points = formatDeltaPoints(deltas?.[tile.key]);
        return (
          <div key={tile.key} style={s.tile} data-testid={`metric-${tile.key}`}>
            <span style={s.label}>{tile.label}</span>
            <div style={s.valueRow}>
              <span className="tnum" style={s.value}>
                {formatPercent(tile.value, na)}
              </span>
              {points != null && (
                <span className="tnum" style={s.delta(deltaTone(deltas?.[tile.key]))}>
                  {t("metrics.deltaPts", { points })}
                </span>
              )}
            </div>
          </div>
        );
      })}
      <div style={s.tile} data-testid="metric-cases_passed">
        <span style={s.label}>{t("metrics.casesPassed")}</span>
        <div style={s.valueRow}>
          <span className="tnum" style={s.value}>
            {metrics ? `${metrics.cases_passed} / ${metrics.cases_total}` : na}
          </span>
        </div>
      </div>
    </div>
  );
}
