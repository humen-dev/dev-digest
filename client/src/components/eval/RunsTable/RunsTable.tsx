"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { EvalRunRecord } from "@devdigest/shared";
import { formatRunCost, formatRunTime, formatVersionLabel } from "@/lib/eval-format";
import { AGENT_COLUMN, CHECKBOX_COLUMN, GRID_COLUMNS, METRIC_COLORS } from "./constants";
import { MiniBar } from "./_components/MiniBar";
import { s } from "./styles";

/**
 * Runs list in the order given: time, version, recall / precision / citation,
 * passed, cost, status. With `selectable`, a checkbox per row reports the
 * selected run ids through `onSelectionChange` (the caller decides what a valid
 * selection is, e.g. exactly two runs to compare). With `showAgent`, the agent name
 * leads the row (runs across several agents, e.g. the dashboard).
 */
export function RunsTable({
  runs,
  selectable = false,
  showAgent = false,
  onSelectionChange,
  rowHref,
}: {
  runs: EvalRunRecord[];
  selectable?: boolean;
  showAgent?: boolean;
  onSelectionChange?: (selectedIds: string[]) => void;
  /** When set, the ran-at cell of each row is a real link to this URL (keyboard-operable). */
  rowHref?: (run: EvalRunRecord) => string;
}) {
  const t = useTranslations("eval");
  const [selected, setSelected] = useState<string[]>([]);
  const columns = [selectable && CHECKBOX_COLUMN, showAgent && AGENT_COLUMN, GRID_COLUMNS]
    .filter(Boolean)
    .join(" ");
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
        {showAgent && <span role="columnheader">{t("dashboard.table.agent")}</span>}
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
            style={s.row(columns, isSelected, i === runs.length - 1)}
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
            {showAgent && (
              <span role="cell" style={s.mono}>
                {run.agent_name}
              </span>
            )}
            <span role="cell" className="mono tnum" style={s.mono}>
              {rowHref ? (
                <Link
                  href={rowHref(run)}
                  aria-label={`${showAgent ? `${run.agent_name} · ` : ""}${label} · ${time}`}
                  style={s.link}
                >
                  {time}
                </Link>
              ) : (
                time
              )}
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
