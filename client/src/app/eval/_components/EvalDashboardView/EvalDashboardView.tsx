/* /eval — Eval Dashboard (SPEC-05 AC-62…AC-66, AC-83). One row per agent with its own
   case-set metrics, the 20 most recent runs, and "Run all agents" behind a confirmation. */
"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Modal, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RunsTable } from "@/components/eval/RunsTable";
import { TrendSparkline } from "@/components/eval/TrendSparkline";
import { formatPercent, formatRunTime, formatVersionLabel } from "@/lib/eval-format";
import { refusalMessage } from "@/lib/eval-errors";
import { useEvalDashboard, useRunAllEvals } from "@/lib/hooks/eval";
import { AGENT_GRID_COLUMNS, RECENT_RUNS_LIMIT, SPARKLINE_COLOR } from "./constants";
import { totalExecutions } from "./helpers";
import { AgentTrendTable } from "./_components/AgentTrendTable";
import { s } from "./styles";

export function EvalDashboardView() {
  const t = useTranslations("eval");
  const tc = useTranslations("common");
  const router = useRouter();
  const { data, isError, refetch } = useEvalDashboard();
  const runAll = useRunAllEvals();
  const [confirming, setConfirming] = React.useState(false);
  const na = t("metrics.notApplicable");

  const crumb = [{ label: t("page.crumbSkillsLab") }, { label: t("page.crumbEvalDashboard") }];

  if (!data) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.page}>
          {isError ? <ErrorState body={t("errors.generic")} onRetry={() => refetch()} /> : <Skeleton height={160} />}
        </div>
      </AppShell>
    );
  }

  const { agents } = data;
  const recent = data.recent_runs.slice(0, RECENT_RUNS_LIMIT);
  const closeDialog = () => {
    setConfirming(false);
    runAll.reset();
  };

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("dashboard.defaultTitle")}</h1>
          </div>
          <Button kind="primary" size="sm" icon="Play" disabled={agents.length === 0} onClick={() => setConfirming(true)}>
            {t("dashboard.runAllAgents")}
          </Button>
        </div>

        {agents.length === 0 ? (
          <EmptyState icon="Gauge" title={t("empty.noCases")} body={t("empty.howToCreate")} />
        ) : (
          <div role="table" aria-label={t("dashboard.defaultTitle")} style={s.table}>
            <div role="row" style={s.head(AGENT_GRID_COLUMNS)}>
              <span role="columnheader">{t("dashboard.table.agent")}</span>
              <span role="columnheader">{t("dashboard.table.version")}</span>
              <span role="columnheader">{t("dashboard.table.ranAt")}</span>
              <span role="columnheader">{t("dashboard.table.pass")}</span>
              <span role="columnheader">{t("dashboard.table.recall")}</span>
              <span role="columnheader">{t("dashboard.table.precision")}</span>
              <span role="columnheader">{t("dashboard.table.citation")}</span>
              <span role="columnheader">{t("dashboard.metricTrend")}</span>
            </div>
            {agents.map((a, i) => {
              const m = a.latest?.metrics ?? null;
              return (
                <div key={a.agent_id} role="row" style={s.row(AGENT_GRID_COLUMNS, i === agents.length - 1)}>
                  <span role="cell" style={s.agentCell}>
                    <Link href={`/eval/agents/${a.agent_id}`} style={s.agentLink}>
                      {a.agent_name}
                    </Link>
                    <span className="mono" style={s.muted}>
                      {a.model}
                    </span>
                  </span>
                  {a.cases_total === 0 ? (
                    <span role="cell" style={s.spanSix}>
                      {t("empty.noCases")} · <Link href={`/agents/${a.agent_id}?tab=evals`}>{t("dashboard.configure")}</Link>
                    </span>
                  ) : !a.latest ? (
                    <span role="cell" style={s.spanSix}>
                      {t("empty.neverRun")}
                    </span>
                  ) : (
                    <>
                      <span role="cell" className="mono" style={s.mono}>
                        {formatVersionLabel(a.latest.agent_version, a.latest.skills_delta, t)}
                      </span>
                      <span role="cell" className="mono tnum" style={s.mono}>
                        {formatRunTime(a.latest.started_at)}
                      </span>
                      <span role="cell" className="mono tnum" style={s.mono}>
                        {m ? t("passingBadge", { passed: m.cases_passed, total: m.cases_total }) : na}
                      </span>
                      <span role="cell" className="tnum">
                        {formatPercent(m?.recall, na)}
                      </span>
                      <span role="cell" className="tnum">
                        {formatPercent(m?.precision, na)}
                      </span>
                      <span role="cell" className="tnum">
                        {formatPercent(m?.citation_accuracy, na)}
                      </span>
                    </>
                  )}
                  <span role="cell">
                    <TrendSparkline data={a.trend.map((p) => p.recall)} color={SPARKLINE_COLOR} />
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {agents.length > 0 && <AgentTrendTable agents={agents} />}
        <p style={s.statement}>{t("dashboard.notRanking")}</p>

        <h2 style={s.h2}>{t("dashboard.recentRuns")}</h2>
        {recent.length === 0 ? (
          <p style={s.muted}>{t("dashboard.noRuns")}</p>
        ) : (
          <RunsTable runs={recent} showAgent onRowClick={(run) => router.push(`/eval/agents/${run.agent_id}`)} />
        )}
      </div>

      {confirming && (
        <Modal
          width={480}
          title={t("dashboard.runAllAgents")}
          onClose={closeDialog}
          footer={
            <div style={s.footer}>
              <Button kind="ghost" size="sm" onClick={closeDialog}>
                {runAll.data ? tc("actions.close") : tc("actions.cancel")}
              </Button>
              {!runAll.data && (
                <Button kind="primary" size="sm" icon="Play" disabled={runAll.isPending} onClick={() => runAll.mutate()}>
                  {t("run.startAll")}
                </Button>
              )}
            </div>
          }
        >
          <div style={s.dialogBody}>
            <span>{t("run.confirmAll", { agents: agents.length, executions: totalExecutions(agents) })}</span>
            {runAll.isError && (
              <span role="alert" style={s.error}>
                {t("errors.generic")}
              </span>
            )}
            {runAll.data && (
              <ul style={s.results} aria-live="polite">
                {runAll.data.results.map((r) => {
                  const refusal = refusalMessage(r.reason, r.details);
                  return (
                    <li key={r.agent_id}>
                      <strong>{r.agent_name}</strong> —{" "}
                      {r.outcome === "started" ? t("status.running") : t(`errors.${refusal.key}`, refusal.values)}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Modal>
      )}
    </AppShell>
  );
}
