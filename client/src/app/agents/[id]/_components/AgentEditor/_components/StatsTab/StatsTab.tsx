"use client";

import React from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentStats } from "@/lib/hooks/agent-performance";
import { usePerfPeriod } from "@/lib/use-perf-period";
import { customRangeLabel } from "@/lib/perf-period";
import { isSmallSample } from "@/lib/accept-rate";
import { formatCost } from "@/lib/format-cost";
import { formatSeconds } from "@/lib/multi-agent-selection";
import { PeriodPicker } from "@/components/agent-performance/PeriodPicker";
import { KpiCard } from "@/components/agent-performance/KpiCard";
import { AcceptRateRing } from "@/components/agent-performance/AcceptRateRing";
import { SmallSampleBadge } from "@/components/agent-performance/SmallSampleBadge";
import { CostDelta } from "@/components/agent-performance/CostDelta";
import { RunsSparkline } from "@/components/agent-performance/RunsSparkline";
import { CostNotes } from "@/components/agent-performance/CostNotes";
import { s } from "./styles";

/** Agent Stats tab: period picker + the four KPIs (runs, avg cost, avg duration, accept rate). */
export function StatsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agentPerformance");
  const locale = useLocale();
  const { state, period, selectPreset, applyCustom } = usePerfPeriod();
  const { data, isPending, refetch } = useAgentStats(agent.id, period);

  const periodLabel =
    state.range === "custom" && state.from && state.to
      ? customRangeLabel(state.from, state.to, locale, new Date())
      : state.range === "1d"
        ? t("period.short1d")
        : t("period.short30d");

  const picker = <PeriodPicker state={state} onPreset={selectPreset} onApplyCustom={applyCustom} />;

  if (!isPending && !data) {
    return (
      <div style={s.wrap}>
        {picker}
        <div role="alert" style={s.error}>
          <span>{t("states.statsLoadError")}</span>
          <Button size="sm" kind="secondary" onClick={() => void refetch()}>
            {t("states.retry")}
          </Button>
        </div>
      </div>
    );
  }

  const loading = isPending || !data;
  const empty = !loading && data.runs === 0;
  const dash = "—";

  return (
    <div style={s.wrap}>
      {picker}
      {empty && <p style={s.empty}>{t("table.noRuns")}</p>}
      <div style={s.grid}>
        <KpiCard
          label={t("kpi.totalRuns", { period: periodLabel })}
          loading={loading}
          value={empty ? dash : data?.runs}
          aside={!empty && data ? <RunsSparkline buckets={data.run_buckets} /> : undefined}
        />
        <KpiCard
          label={t("kpi.avgCostRun")}
          loading={loading}
          value={empty ? dash : formatCost(data?.avg_cost_usd)}
          footer={
            empty || !data ? undefined : (
              <div style={s.footerStack}>
                <CostDelta current={data.avg_cost_usd} previous={data.prev_avg_cost_usd} />
                <CostNotes unpricedRuns={data.unpriced_runs} />
              </div>
            )
          }
        />
        <KpiCard
          label={t("kpi.avgDuration")}
          loading={loading}
          value={empty || data?.avg_duration_ms == null ? dash : formatSeconds(data.avg_duration_ms)}
        />
        <KpiCard
          label={t("kpi.acceptRate")}
          loading={loading}
          value={
            empty || !data ? (
              dash
            ) : (
              <AcceptRateRing accepted={data.accepted} decided={data.decided} rate={data.accept_rate} />
            )
          }
          footer={!empty && data && isSmallSample(data.decided) ? <SmallSampleBadge decided={data.decided} /> : undefined}
        />
      </div>
    </div>
  );
}
