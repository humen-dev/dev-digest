"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, EmptyState, Skeleton } from "@devdigest/ui";
import { PeriodPicker } from "@/components/agent-performance/PeriodPicker";
import { useAgentPerformance } from "@/lib/hooks/agent-performance";
import { usePerfPeriod } from "@/lib/use-perf-period";
import { useAgentTableSort } from "./useAgentTableSort";
import { AgentTable } from "./_components/AgentTable";
import { CostBreakdown } from "./_components/CostBreakdown";
import { KpiRow } from "./_components/KpiRow";
import { s } from "./styles";

/**
 * Agent Performance dashboard: KPI row, per-agent table, cost breakdown for the
 * URL-selected period. Reads only (GET); a pending or failed fetch shows
 * placeholders / a retry message, never numbers (AC-62..66).
 */
export function AgentPerformanceView() {
  const t = useTranslations("agentPerformance");
  const { state, period, selectPreset, applyCustom } = usePerfPeriod();
  const { data, isLoading, refetch } = useAgentPerformance(period);
  const { sort, toggle } = useAgentTableSort();

  let content: React.ReactNode;
  if (isLoading) {
    content = (
      <>
        <KpiRow data={undefined} periodState={state} />
        <div style={s.tablePlaceholder} aria-busy="true">
          <Skeleton height={220} />
        </div>
        <CostBreakdown data={undefined} />
      </>
    );
  } else if (!data) {
    content = (
      <div role="alert" style={s.error}>
        <span>{t("states.loadError")}</span>
        <Button kind="secondary" size="sm" onClick={() => refetch()}>
          {t("states.retry")}
        </Button>
      </div>
    );
  } else if (data.summary.runs === 0) {
    content = (
      <EmptyState
        icon="Gauge"
        title={t("states.emptyTitle")}
        body={
          <Link href="/" style={s.emptyLink}>
            {t("states.emptyCta")}
          </Link>
        }
      />
    );
  } else {
    content = (
      <>
        <KpiRow data={data} periodState={state} />
        <AgentTable rows={data.agents} sort={sort} periodState={state} onSort={toggle} />
        <CostBreakdown data={data} />
      </>
    );
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.h1}>{t("title")}</h1>
          <p style={s.subtitle}>{t("subtitle")}</p>
        </div>
        <div style={s.picker}>
          <PeriodPicker state={state} onPreset={selectPreset} onApplyCustom={applyCustom} />
        </div>
      </div>
      {content}
    </div>
  );
}
