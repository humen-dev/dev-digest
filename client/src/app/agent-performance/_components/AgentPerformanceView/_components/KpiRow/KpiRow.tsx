"use client";

import React from "react";
import { useLocale, useTranslations } from "next-intl";
import type { AgentPerf } from "@devdigest/shared";
import { AcceptRateRing } from "@/components/agent-performance/AcceptRateRing";
import { CostDelta } from "@/components/agent-performance/CostDelta";
import { CostNotes } from "@/components/agent-performance/CostNotes";
import { KpiCard } from "@/components/agent-performance/KpiCard";
import { RunsSparkline } from "@/components/agent-performance/RunsSparkline";
import { ratePercent } from "@/lib/accept-rate";
import { formatCost } from "@/lib/format-cost";
import { customRangeLabel, type PerfPeriodState } from "@/lib/perf-period";
import { AgentIdentity } from "../AgentIdentity";
import { s } from "./styles";

/**
 * The four KPI cards. `data` is `undefined` while the aggregates load: every
 * card then shows placeholders only — never a digit (AC-62).
 */
export function KpiRow({ data, periodState }: { data: AgentPerf | undefined; periodState: PerfPeriodState }) {
  const t = useTranslations("agentPerformance");
  const locale = useLocale();
  const loading = data === undefined;
  const period =
    periodState.range === "custom" && periodState.from && periodState.to
      ? customRangeLabel(periodState.from, periodState.to, locale, new Date())
      : t(periodState.range === "1d" ? "period.short1d" : "period.short30d");
  const summary = data?.summary;
  const top = summary?.most_active ?? null;

  return (
    <div style={s.row}>
      <KpiCard
        label={t("kpi.totalRuns", { period })}
        loading={loading}
        value={summary?.runs}
        footer={data ? <RunsSparkline buckets={data.run_buckets} /> : undefined}
      />
      <KpiCard
        label={t("kpi.totalCost", { period })}
        loading={loading}
        value={formatCost(summary?.total_cost_usd)}
        aside={summary ? <CostDelta current={summary.total_cost_usd} previous={summary.prev_total_cost_usd} /> : undefined}
        footer={summary ? <CostNotes unpricedRuns={summary.unpriced_runs} pricedCiRuns={summary.priced_ci_runs} /> : undefined}
      />
      <KpiCard
        label={t("kpi.avgAccept")}
        loading={loading}
        value={
          summary ? (
            <AcceptRateRing accepted={summary.accepted} decided={summary.decided} rate={summary.avg_accept_rate} />
          ) : null
        }
      />
      <KpiCard
        label={t("kpi.mostActive")}
        loading={loading}
        value={
          top ? (
            <span style={s.mostActive}>
              <AgentIdentity agentId={top.agent_id} name={top.agent_name} />
            </span>
          ) : (
            "—"
          )
        }
        footer={
          top
            ? top.accept_rate != null
              ? t("kpi.mostActiveMeta", { runs: top.runs, rate: ratePercent(top.accept_rate) })
              : t("kpi.mostActiveMetaNoRate", { runs: top.runs })
            : undefined
        }
      />
    </div>
  );
}
