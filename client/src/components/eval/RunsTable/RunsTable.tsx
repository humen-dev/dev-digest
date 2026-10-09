"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import type { EvalRunRecord } from "@devdigest/shared";
import { formatRunCost, formatRunTime, formatVersionLabel } from "../../../lib/eval-format";
import { GRID_COLUMNS, GRID_COLUMNS_SELECTABLE, METRIC_COLORS } from "./constants";
import { MiniBar } from "./_components/MiniBar";
import { s } from "./styles";

/**
 * Runs list in the order given: time, version, recall / precision / citation,
 * passed, cost, status. With `selectable`, a checkbox per row reports the
 * selected run ids through `onSelectionChange` (the caller decides what a valid
 * selection is, e.g. exactly two runs to compare).
 */
export function RunsTable({
  runs,
  selectable = false,
  onSelectionChange,
  onRowClick,
}: {
  runs: EvalRunRecord[];
  selectable?: boolean;
  onSelectionChange?: (selectedIds: string[]) => void;
  onRowClick?: (run: EvalRunRecord) => void;
}) {
  const t = useTranslations("eval");
  const [selected, setSelected] = useState<string[]>([]);
  const columns = selectable ? GRID_COLUMNS_SELECTABLE : GRID_COLUMNS;
  const na = t("metrics.notApplicable");

  function toggle(id: string) {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    setSelected(next);
    onSelectionChange?.(next);
  }

  return (
    <div role="table" style={s.table}>
      <div role="row" style={s.header(columns)}>
        {selectable && <span role="columnheader" />}
        <span role="columnheader">{t("dashboard.table.ranAt")}</span>
        <span role="columnheader">{t("dashboard.table.version")}</span>
        <span role="columnheader">{t("dashboard.table.recall")}</span>
        <span role="columnheader">{t("dashboard.table.precision")}</span>
        <span role="columnheader">{t("dashboard.table.citation")}</span>
        <span role="columnheader">{t("dashboard.table.pass")}</span>
        <span role="columnheader">{t("dashboard.table.cost")}</span>
        <span role="columnheader">{t("dashboard.table.status")}</span>
      </div>
      {runs.map((run, i) => {
        const label = formatVersionLabel(run.agent_version, run.skills_delta, t);
        const time = formatRunTime(run.started_at);
        const isSelected = selected.includes(run.id);
        const m = run.metrics;
        return (
          <div
            key={run.id}
            role="row"
            onClick={onRowClick ? () => onRowClick(run) : undefined}
            style={s.row(columns, isSelected, !!onRowClick, i === runs.length - 1)}
          >
            {selectable && (
              <span role="cell" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggle(run.id)}
                  aria-label={`${label} · ${time}`}
                />
              </span>
            )}
            <span role="cell" className="mono tnum" style={s.mono}>
              {time}
            </span>
            <span role="cell" className="mono" style={s.mono}>
              {label}
            </span>
            <span role="cell">
              <MiniBar value={m?.recall ?? null} color={METRIC_COLORS.recall} notApplicable={na} />
            </span>
            <span role="cell">
              <MiniBar value={m?.precision ?? null} color={METRIC_COLORS.precision} notApplicable={na} />
            </span>
            <span role="cell">
              <MiniBar
                value={m?.citation_accuracy ?? null}
                color={METRIC_COLORS.citation}
                notApplicable={na}
              />
            </span>
            <span role="cell" className="mono tnum" style={s.mono}>
              {m ? t("passingBadge", { passed: m.cases_passed, total: m.cases_total }) : na}
            </span>
            <span role="cell" className="mono tnum" style={s.mono}>
              {formatRunCost(run.cost_usd)}
            </span>
            <span role="cell" style={s.status(run.status)}>
              {t(`status.${run.status}`)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
