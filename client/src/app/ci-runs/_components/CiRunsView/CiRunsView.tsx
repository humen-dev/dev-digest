"use client";

import React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { useCiRuns, useRefreshCiRuns } from "@/lib/hooks/ci";
import { buildRunsQuery, filtersToSearch, parseFilters } from "./helpers";
import { useAutoRefresh } from "./useAutoRefresh";
import { s } from "./styles";
import type { CiRunsFilterState } from "./types";
import { CiRunsFilters } from "./_components/CiRunsFilters";
import { CiRunsTable } from "./_components/CiRunsTable";
import { CiRunTraceDrawer } from "./_components/CiRunTraceDrawer";

/** Workspace-scoped CI Runs: URL-backed filters, table, refresh and trace drawer. */
export function CiRunsView() {
  const t = useTranslations("ci");
  const search = useSearchParams();
  const router = useRouter();
  const filters = parseFilters(search);
  const { range, agent, repo, status, source } = filters;

  // `from` is derived from "now"; keep it stable per filter set so the query key doesn't churn.
  const query = React.useMemo(
    () => buildRunsQuery({ range, agent, repo, status, source }, new Date()),
    [range, agent, repo, status, source],
  );
  const { data, isLoading, refetch } = useCiRuns(query);
  const refresh = useRefreshCiRuns();
  const [traceRunId, setTraceRunId] = React.useState<string | null>(null);

  useAutoRefresh(() => refresh.mutate(false));

  const setFilters = (patch: Partial<CiRunsFilterState>) => {
    const qs = filtersToSearch({ ...filters, ...patch });
    router.replace(qs ? `/ci-runs?${qs}` : "/ci-runs");
  };

  const degradedReason = refresh.data?.degraded ? (refresh.data.reason ?? "") : null;

  let content: React.ReactNode;
  if (isLoading) {
    content = <Skeleton height={200} />;
  } else if (!data) {
    content = <ErrorState body={t("runs.loadError")} onRetry={() => refetch()} />;
  } else {
    // agents/repos cover every stored run, so both empty = nothing ever ingested.
    const workspaceEmpty = data.runs.length === 0 && data.agents.length === 0 && data.repos.length === 0;
    content = (
      <>
        {!workspaceEmpty && (
          <CiRunsFilters filters={filters} agents={data.agents} repos={data.repos} onChange={setFilters} />
        )}
        {data.runs.length === 0 ? (
          !workspaceEmpty ? (
            <p style={s.hint}>{t("runs.noMatches")}</p>
          ) : (
            <EmptyState
              icon="Workflow"
              title={t("runs.emptyTitle")}
              body={
                <>
                  {t("runs.emptyBody")}
                  <br />
                  <Link href="/agents" style={s.emptyLink}>
                    {t("runs.emptyCta")}
                  </Link>
                </>
              }
            />
          )
        ) : (
          <CiRunsTable runs={data.runs} onOpenTrace={setTraceRunId} />
        )}
      </>
    );
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.h1}>{t("runs.title")}</h1>
          <p style={s.subtitle}>{t("runs.subtitle")}</p>
        </div>
        <div style={s.refreshRow}>
          <span style={s.autoRefresh}>
            <span style={s.autoDot} />
            {t("runs.autoRefresh")}
          </span>
          <Button kind="secondary" size="sm" icon="RefreshCw" onClick={() => refresh.mutate(true)} loading={refresh.isPending}>
            {refresh.isPending ? t("runs.refreshing") : t("runs.refresh")}
          </Button>
        </div>
      </div>

      {degradedReason !== null && (
        <div role="alert" style={s.banner}>
          {t("runs.degraded", { reason: degradedReason })}
        </div>
      )}

      {content}

      {traceRunId && <CiRunTraceDrawer runId={traceRunId} onClose={() => setTraceRunId(null)} />}
    </div>
  );
}
