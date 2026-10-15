"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { AgentPerfRow } from "@devdigest/shared";
import { SmallSampleBadge } from "@/components/agent-performance/SmallSampleBadge";
import { ratePercent } from "@/lib/accept-rate";
import { formatCost } from "@/lib/format-cost";
import { formatSeconds, rowKey, trendOf } from "../../helpers";
import { AgentIdentity } from "../AgentIdentity";
import { RecentRuns } from "../RecentRuns";
import { RelativeTime } from "../RelativeTime";
import { s } from "./styles";

const GOOD_RATE = 0.6;
const COLUMN_COUNT = 7;

/** One agent row plus its expandable latest-runs panel. `viewHref` is null for the Unknown agent. */
export function AgentTableRow({ row, viewHref }: { row: AgentPerfRow; viewHref: string | null }) {
  const t = useTranslations("agentPerformance");
  const [expanded, setExpanded] = useState(false);
  const empty = row.runs === 0;
  const trend = trendOf(row);
  const panelId = `recent-runs-${rowKey(row)}`;
  const name = row.agent_id == null ? t("table.unknownAgent") : row.agent_name;
  const dash = "—";

  return (
    <>
      <tr style={s.row(empty)}>
        <td style={s.td}>
          <div style={s.agentCell}>
            <button
              type="button"
              style={s.expand}
              aria-expanded={expanded}
              aria-controls={panelId}
              aria-label={t("table.expand", { name })}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? <Icon.ChevronDown size={14} /> : <Icon.ChevronRight size={14} />}
            </button>
            <AgentIdentity
              agentId={row.agent_id}
              name={row.agent_name}
              badge={row.enabled === false ? <Badge>{t("table.disabled")}</Badge> : undefined}
              sub={empty ? t("table.noRuns") : undefined}
            />
          </div>
        </td>
        <td className="tnum" style={s.td}>
          {empty ? dash : row.runs}
        </td>
        <td className="mono tnum" style={s.td}>
          {empty ? dash : formatCost(row.avg_cost_usd)}
        </td>
        <td className="tnum" style={s.td}>
          {empty ? dash : formatSeconds(row.avg_duration_ms)}
        </td>
        <td style={s.td}>
          {empty || row.decided === 0 || row.accept_rate == null ? (
            dash
          ) : (
            <div style={s.rateCell}>
              <span className="tnum" style={s.rate(row.accept_rate >= GOOD_RATE)}>
                {t("table.rateCell", {
                  rate: ratePercent(row.accept_rate),
                  accepted: row.accepted,
                  decided: row.decided,
                })}
              </span>
              {trend && (
                <span
                  role="img"
                  style={s.arrow(trend.direction === "up")}
                  aria-label={t(`trend.${trend.direction}`, { rate: trend.previousPercent })}
                >
                  {trend.direction === "up" ? <Icon.ArrowUp size={12} /> : <Icon.ArrowDown size={12} />}
                </span>
              )}
              <SmallSampleBadge decided={row.decided} />
            </div>
          )}
        </td>
        <td style={{ ...s.td, ...s.muted }}>{empty ? dash : <RelativeTime iso={row.last_run_at} />}</td>
        <td style={s.td}>
          {viewHref ? (
            <Link href={viewHref} style={s.link}>
              {t("table.view")}
            </Link>
          ) : null}
        </td>
      </tr>
      {expanded && (
        <tr style={s.row(empty)}>
          <td colSpan={COLUMN_COUNT} style={s.detail}>
            <RecentRuns id={panelId} runs={row.recent_runs} />
          </td>
        </tr>
      )}
    </>
  );
}
