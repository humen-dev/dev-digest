import React from "react";
import { useTranslations } from "next-intl";
import type { EvalAgentSummary } from "@devdigest/shared";
import { formatPercent, formatRunTime, formatVersionLabel } from "@/lib/eval-format";
import { s } from "./styles";

/**
 * Tabular equivalent of the per-agent recall sparklines (NFR-12 / AC-83): the
 * sparklines are aria-hidden, this visually-hidden table carries the same values.
 */
export function AgentTrendTable({ agents }: { agents: readonly EvalAgentSummary[] }) {
  const t = useTranslations("eval");
  const na = t("metrics.notApplicable");
  return (
    <table style={s.srOnly}>
      <caption>{t("dashboard.trendTable")}</caption>
      <thead>
        <tr>
          <th scope="col">{t("dashboard.table.agent")}</th>
          <th scope="col">{t("dashboard.table.ranAt")}</th>
          <th scope="col">{t("dashboard.table.version")}</th>
          <th scope="col">{t("dashboard.table.recall")}</th>
        </tr>
      </thead>
      <tbody>
        {agents.flatMap((a) =>
          a.trend.map((p) => (
            <tr key={`${a.agent_id}-${p.run_id}`}>
              <td>{a.agent_name}</td>
              <td>{formatRunTime(p.ran_at)}</td>
              <td>{formatVersionLabel(p.agent_version, false, t)}</td>
              <td>{formatPercent(p.recall, na)}</td>
            </tr>
          )),
        )}
      </tbody>
    </table>
  );
}
