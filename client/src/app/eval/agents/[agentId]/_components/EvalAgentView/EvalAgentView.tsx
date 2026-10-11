/* /eval/agents/:agentId — one agent's eval page (SPEC-05 AC-50, AC-68…AC-70, AC-82, EC-18).
   Tiles with deltas, trend, insight banner, run list with selection; Compare is enabled
   only while exactly two runs are selected. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, SelectInput, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { MetricTiles } from "@/components/eval/MetricTiles";
import { MetricTrend } from "@/components/eval/MetricTrend";
import { RunEvalControl } from "@/components/eval/RunEvalControl";
import { RunsTable } from "@/components/eval/RunsTable";
import { useEvalAgentDetail, useEvalDashboard } from "@/lib/hooks/eval";
import { CompareDialog } from "../CompareDialog";
import { InsightBanner } from "../InsightBanner";
import { comparePair, metricDeltas } from "./helpers";
import { s } from "./styles";

export function EvalAgentView({ agentId }: { agentId: string }) {
  const t = useTranslations("eval");
  const router = useRouter();
  const { data, isError, refetch } = useEvalAgentDetail(agentId);
  const dashboard = useEvalDashboard();
  const [selected, setSelected] = React.useState<string[]>([]);
  const [comparing, setComparing] = React.useState(false);

  const crumb = [
    { label: t("page.crumbSkillsLab") },
    { label: t("page.crumbEvalDashboard"), href: "/eval" },
    ...(data ? [{ label: data.agent_name }] : []),
  ];

  if (!data) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.page}>
          {isError ? <ErrorState body={t("errors.generic")} onRetry={() => refetch()} /> : <Skeleton height={160} />}
        </div>
      </AppShell>
    );
  }

  const pair = comparePair(data.runs, selected);
  const options = (dashboard.data?.agents ?? []).map((a) => ({ value: a.agent_id, label: a.agent_name }));
  if (!options.some((o) => o.value === agentId)) options.unshift({ value: agentId, label: data.agent_name });

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{data.agent_name}</h1>
            <p style={s.subtitle}>
              <span className="mono">{data.model}</span> ·{" "}
              {t("dashboard.casesSummary", { count: data.cases_total, runs: data.runs.length })}
            </p>
          </div>
          <label style={s.selector}>
            <span style={s.srOnly}>{t("page.crumbAgents")}</span>
            <SelectInput
              mono={false}
              value={agentId}
              options={options}
              onChange={(id) => router.push(`/eval/agents/${id}`)}
            />
          </label>
          <RunEvalControl agentId={agentId} detail={data} />
        </div>

        {data.cases_total === 0 ? (
          <EmptyState icon="Gauge" title={t("empty.noCases")} body={t("empty.howToCreate")} />
        ) : !data.latest ? (
          <p style={s.muted}>{t("empty.neverRun")}</p>
        ) : (
          <>
            <MetricTiles metrics={data.latest.metrics} deltas={metricDeltas(data.latest, data.previous)} />
            <InsightBanner banner={data.banner} />
            <MetricTrend points={data.trend} />
            <p style={s.statement}>{t("scoringNote")}</p>
          </>
        )}

        {data.runs.length > 0 && (
          <>
            <div style={s.runsHeader}>
              <h2 style={s.h2}>{t("dashboard.recentRuns")}</h2>
              <span style={s.grow} />
              {data.runs.length < 2 && <span style={s.muted}>{t("empty.runAgain")}</span>}
              <Button kind="secondary" size="sm" icon="GitCompare" disabled={!pair} onClick={() => setComparing(true)}>
                {t("compare.action")}
              </Button>
            </div>
            <RunsTable runs={data.runs} selectable onSelectionChange={setSelected} />
          </>
        )}
      </div>

      {comparing && pair && (
        <CompareDialog olderId={pair.olderId} newerId={pair.newerId} onClose={() => setComparing(false)} />
      )}
    </AppShell>
  );
}
