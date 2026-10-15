"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { AgentPerfRow } from "@devdigest/shared";
import { perfPeriodParams, type PerfPeriodState } from "@/lib/perf-period";
import { SORT_COLUMNS, type SortKey, type SortState } from "../../constants";
import { rowKey, sortRows } from "../../helpers";
import { AgentTableRow } from "../AgentTableRow";
import { s } from "./styles";

/** Link to the agent's Stats tab carrying the current period (AC-46). */
function statsHref(agentId: string, period: PerfPeriodState): string {
  const sp = new URLSearchParams({ tab: "stats", ...perfPeriodParams(period) });
  return `/agents/${encodeURIComponent(agentId)}?${sp.toString()}`;
}

/** Sortable per-agent table; the current sort column exposes `aria-sort` (NFR-5). */
export function AgentTable({
  rows,
  sort,
  periodState,
  onSort,
}: {
  rows: AgentPerfRow[];
  sort: SortState;
  periodState: PerfPeriodState;
  onSort: (key: SortKey) => void;
}) {
  const t = useTranslations("agentPerformance");
  const sorted = sortRows(rows, sort);
  const header = (key: SortKey, label: string) => {
    const active = sort.key === key;
    return (
      <th
        key={key}
        scope="col"
        style={s.th}
        aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
      >
        <button type="button" style={s.sortButton} onClick={() => onSort(key)}>
          {label}
          {active && (sort.dir === "asc" ? <Icon.ArrowUp size={11} /> : <Icon.ArrowDown size={11} />)}
        </button>
      </th>
    );
  };

  return (
    <div style={s.card}>
      <table style={s.table}>
        <thead>
          <tr>
            <th scope="col" style={s.th}>
              {t("table.agent")}
            </th>
            {SORT_COLUMNS.map((c) => header(c.key, t(`table.${c.label}`)))}
            <th scope="col" style={s.th}>
              {t("table.lastRun")}
            </th>
            <th scope="col" style={s.th}>
              {t("table.view")}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <AgentTableRow
              key={rowKey(row)}
              row={row}
              viewHref={row.agent_id == null ? null : statsHref(row.agent_id, periodState)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
