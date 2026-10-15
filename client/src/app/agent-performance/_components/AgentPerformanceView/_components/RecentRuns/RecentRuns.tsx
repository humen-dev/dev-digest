"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { PerfRecentRun } from "@devdigest/shared";
import { formatCost } from "@/lib/format-cost";
import { formatSeconds } from "../../helpers";
import { RelativeTime } from "../RelativeTime";
import { s } from "./styles";

const COLUMNS = ["time", "status", "source", "duration", "cost"] as const;

/** The agent's latest counted runs of the period (newest first), shown when its row is expanded. */
export function RecentRuns({ id, runs }: { id: string; runs: PerfRecentRun[] }) {
  const t = useTranslations("agentPerformance");
  return (
    <div id={id} style={s.wrap}>
      {runs.length === 0 ? (
        <p style={s.empty}>{t("table.noRuns")}</p>
      ) : (
        <table style={s.table}>
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c} scope="col" style={s.th}>
                  {t(`recent.${c}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.run_id}>
                <td style={s.td}>
                  <RelativeTime iso={run.ran_at} />
                </td>
                <td style={s.td}>{t(`recent.statusValue.${run.status}`)}</td>
                <td style={s.td}>{t(`recent.sourceValue.${run.source}`)}</td>
                <td className="tnum" style={s.td}>
                  {formatSeconds(run.duration_ms)}
                </td>
                <td className="mono tnum" style={s.td}>
                  {formatCost(run.cost_usd)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
