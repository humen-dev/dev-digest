"use client";

import React, { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { MetricTiles } from "@/components/eval/MetricTiles";
import { RunsTable } from "@/components/eval/RunsTable";
import { RunEvalControl } from "@/components/eval/RunEvalControl";
import { useEvalAgentDetail, useEvalCases } from "@/lib/hooks/eval";
import { metricDeltas } from "./helpers";
import { CaseList } from "./_components/CaseList";
import { CaseEditor } from "./_components/CaseEditor";
import { NewCaseForm } from "./_components/NewCaseForm";
import { s } from "./styles";

/** Agent "Evals" tab (SPEC-05): metric tiles, case list, run history and the run control.
 *  `?case=<id>` opens that case's editor (AC-12). */
export function EvalsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("eval");
  const search = useSearchParams();
  const detailQ = useEvalAgentDetail(agent.id);
  const casesQ = useEvalCases(agent.id);
  const [openId, setOpenId] = useState<string | null>(() => search.get("case"));
  const [creating, setCreating] = useState(false);
  const router = useRouter();

  /** Close the editor and drop `?case=` so a reload does not reopen it (other params stay). */
  function closeCase() {
    setOpenId(null);
    if (search.get("case") === null) return;
    const params = new URLSearchParams(search.toString());
    params.delete("case");
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }

  if (detailQ.isError || casesQ.isError) {
    return (
      <ErrorState
        title={t("errors.generic")}
        onRetry={() => {
          detailQ.refetch();
          casesQ.refetch();
        }}
      />
    );
  }
  if (!detailQ.data || !casesQ.data) {
    return (
      <div style={s.wrap} aria-busy="true">
        <span style={s.muted}>{t("evalsTab.loadingCases")}</span>
        <Skeleton height={80} />
      </div>
    );
  }

  const detail = detailQ.data;
  const cases = casesQ.data;
  const metrics = detail.latest?.metrics ?? null;
  const deltas = metricDeltas(detail.latest, detail.previous);

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("evalsTab.metricsTitle")}</h2>
        <span style={s.subtitle}>{t("evalsTab.metricsSubtitle")}</span>
        <div style={s.spacer}>
          {cases.length > 0 && <RunEvalControl agentId={agent.id} detail={detail} />}
        </div>
      </div>

      {cases.length === 0 ? (
        <div style={s.empty}>
          <div style={s.emptyTitle}>{t("empty.noCases")}</div>
          <div style={s.muted}>{t("empty.howToCreate")}</div>
        </div>
      ) : metrics ? (
        <>
          <MetricTiles metrics={metrics} deltas={deltas} />
          {metrics.uncovered_findings > 0 && (
            <div style={s.uncovered}>{t("uncovered", { count: metrics.uncovered_findings })}</div>
          )}
          {!detail.previous && <div style={s.muted}>{t("empty.runAgain")}</div>}
        </>
      ) : (
        <div style={s.empty}>
          <div style={s.emptyTitle}>{t("empty.neverRun")}</div>
        </div>
      )}

      <div style={s.section}>
        <div style={s.header}>
          <h3 style={s.h2}>{t("evalsTab.casesHeading")}</h3>
          {metrics && (
            <span style={s.badge}>
              {t("passingBadge", { passed: metrics.cases_passed, total: metrics.cases_total })}
            </span>
          )}
          <div style={s.spacer}>
            <Button size="sm" kind="secondary" icon="Plus" onClick={() => setCreating(true)}>
              {t("evalsTab.newCase")}
            </Button>
          </div>
        </div>
        {cases.length > 0 && (
          <>
            <CaseList cases={cases} onOpen={setOpenId} />
            <div style={s.muted}>{t("scoringNote")}</div>
          </>
        )}
      </div>

      {detail.runs.length > 0 && <RunsTable runs={detail.runs} />}

      {openId && <CaseEditor agentId={agent.id} caseId={openId} onClose={closeCase} />}
      {creating && <NewCaseForm agentId={agent.id} onClose={() => setCreating(false)} />}
    </div>
  );
}
