"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { LineChart } from "@devdigest/ui";
import type { EvalTrendPoint } from "@devdigest/shared";
import { formatPercent, formatRunTime, formatVersionLabel } from "../../../lib/eval-format";
import { SERIES_COLORS } from "./constants";
import { s } from "./styles";

/**
 * Recall / precision / citation trend over runs (oldest → newest, as given).
 * The chart is decorative (aria-hidden); a visually-hidden table carries the
 * same values for assistive tech. Null metrics read "n/a" in the table and are
 * plotted at 0 by the vendored LineChart.
 */
export function MetricTrend({ points }: { points: EvalTrendPoint[] }) {
  const t = useTranslations("eval");
  const na = t("metrics.notApplicable");

  const series = [
    { name: t("dashboard.legend.recall"), color: SERIES_COLORS.recall, data: points.map((p) => p.recall ?? 0) },
    { name: t("dashboard.legend.precision"), color: SERIES_COLORS.precision, data: points.map((p) => p.precision ?? 0) },
    { name: t("dashboard.legend.citation"), color: SERIES_COLORS.citation, data: points.map((p) => p.citation_accuracy ?? 0) },
  ];

  return (
    <div>
      <div aria-hidden="true">
        <LineChart series={series} yMin={0} yMax={1} />
        <div style={s.legend}>
          {series.map((x) => (
            <span key={x.name} style={s.legendItem}>
              <span style={s.swatch(x.color)} />
              {x.name}
            </span>
          ))}
        </div>
      </div>
      <table style={s.srOnly}>
        <caption>{t("dashboard.trendTable")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("dashboard.table.ranAt")}</th>
            <th scope="col" />
            <th scope="col">{t("dashboard.table.recall")}</th>
            <th scope="col">{t("dashboard.table.precision")}</th>
            <th scope="col">{t("dashboard.table.citation")}</th>
            <th scope="col">{t("dashboard.table.pass")}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.run_id}>
              <td>{formatRunTime(p.ran_at)}</td>
              <td>{formatVersionLabel(p.agent_version, false, t)}</td>
              <td>{formatPercent(p.recall, na)}</td>
              <td>{formatPercent(p.precision, na)}</td>
              <td>{formatPercent(p.citation_accuracy, na)}</td>
              <td>{t("passingBadge", { passed: p.cases_passed, total: p.cases_total })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
