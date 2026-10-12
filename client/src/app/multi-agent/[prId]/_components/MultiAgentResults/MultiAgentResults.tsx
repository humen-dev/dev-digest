/* /multi-agent/:prId — results of one multi-agent run: header, Columns / Tabs
   views over one shared resource, "Where agents disagree" below, trace drawer. */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { FindingActionKind } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import RunTraceDrawer from "@/components/review/RunTraceDrawer";
import { ApiError } from "@/lib/api";
import { useCancelRun, useFindingAction } from "@/lib/hooks/reviews";
import { useMultiAgentRun } from "@/lib/hooks/multi-agent";
import { multiAgentConfigureUrl, multiAgentResultsUrl } from "@/lib/multi-agent-urls";
import { ColumnsView } from "../ColumnsView";
import { ConflictsSection } from "../ConflictsSection";
import { ResultsHeader, type ViewMode } from "../ResultsHeader";
import { TabsView } from "../TabsView";
import {
  allFailed,
  anyRunning,
  buildGroupIndex,
  participatingCount,
  sharedFailureReason,
} from "./helpers";
import { s } from "./styles";
import { useStatusAnnouncement } from "./useStatusAnnouncement";

type TriageAction = Extract<FindingActionKind, "accept" | "dismiss">;

export function MultiAgentResults() {
  const t = useTranslations("multiAgent");
  const params = useParams<{ prId: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const prId = params.prId;
  const multiRunId = search.get("multiRunId");
  const traceRunId = search.get("trace");
  const [view, setView] = React.useState<ViewMode>("columns");

  const { data, isLoading, isError, error, refetch } = useMultiAgentRun(prId, multiRunId);
  const findingAction = useFindingAction();
  const cancel = useCancelRun();
  const announcement = useStatusAnnouncement(data?.columns);

  // Pin the shown run in the URL (shareable link). Seed the cache under the new key
  // first so the swap does not flash a skeleton or refetch.
  React.useEffect(() => {
    if (!data || multiRunId) return;
    qc.setQueryData(["multi-agent-run", prId, data.id], data);
    router.replace(multiAgentResultsUrl(prId, data.id));
  }, [data, multiRunId, prId, qc, router]);

  const groups = React.useMemo(() => buildGroupIndex(data?.columns ?? []), [data]);

  const setTrace = (runId: string | null) => {
    const sp = new URLSearchParams(search.toString());
    if (runId) sp.set("trace", runId);
    else sp.delete("trace");
    const qs = sp.toString();
    router.replace(`/multi-agent/${prId}${qs ? `?${qs}` : ""}`);
  };

  const onFindingAction = (findingId: string, action: TriageAction) =>
    findingAction.mutate(
      { findingId, action, prId },
      { onSuccess: () => qc.invalidateQueries({ queryKey: ["multi-agent-run", prId] }) },
    );

  const crumb = [
    { label: t("title"), href: "/multi-agent" },
    ...(data?.pr_number != null ? [{ label: `#${data.pr_number}`, mono: true }] : []),
  ];

  if (isLoading || (!data && !isError)) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.page}>
          <Skeleton height={28} width={420} />
          <Skeleton height={240} />
        </div>
      </AppShell>
    );
  }

  if (!data) {
    const notFound = error instanceof ApiError && error.status === 404;
    if (notFound && !multiRunId) {
      return (
        <AppShell crumb={crumb}>
          <div style={s.page}>
            <EmptyState
              icon="Users"
              title={t("results.noRunTitle")}
              cta={t("results.noRunCta")}
              onCta={() => router.push(multiAgentConfigureUrl({ prId }))}
            />
          </div>
        </AppShell>
      );
    }
    if (notFound) {
      return (
        <AppShell crumb={crumb}>
          <div style={s.page}>
            <EmptyState icon="Users" title={t("results.notFound")} />
            <Button kind="secondary" onClick={() => router.push(multiAgentConfigureUrl({ prId }))}>
              {t("results.configureRun")}
            </Button>
          </div>
        </AppShell>
      );
    }
    return (
      <AppShell crumb={crumb}>
        <ErrorState fullScreen title={t("title")} body={error?.message ?? ""} onRetry={() => refetch()} />
      </AppShell>
    );
  }

  const columns = data.columns;
  const runningIds = columns.filter((c) => c.status === "running").map((c) => c.run_id);
  const sharedReason = sharedFailureReason(columns);
  const noResults = allFailed(columns) && !sharedReason;
  const traceColumn = columns.find((c) => c.run_id === traceRunId);
  const viewProps = {
    columns,
    groups,
    hideErrors: sharedReason != null,
    pending: findingAction.isPending,
    onViewTrace: setTrace,
    onFindingAction,
  };

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <ResultsHeader
          run={data}
          view={view}
          onViewChange={setView}
          canCancel={anyRunning(columns)}
          onCancelAll={() => runningIds.forEach((id) => cancel.mutate(id))}
          onConfigure={() =>
            router.push(
              multiAgentConfigureUrl({
                prId: data.pr_id,
                agentIds: columns.flatMap((c) => (c.agent_id ? [c.agent_id] : [])),
              }),
            )
          }
          announcement={announcement}
        />

        {sharedReason != null && (
          <div role="alert" style={s.banner}>
            {t("results.sharedFailure", { reason: sharedReason })}
          </div>
        )}

        {noResults ? (
          <div style={s.noResults}>
            <div style={s.noResultsTitle}>{t("results.noResults")}</div>
            {columns.map((c) => (
              <div key={c.run_id} style={s.reason}>
                <span style={s.reasonAgent}>{c.agent_name}</span>
                {c.error ? `: ${c.error}` : ""}
              </div>
            ))}
          </div>
        ) : (
          <>
            {view === "columns" ? <ColumnsView {...viewProps} /> : <TabsView {...viewProps} />}
            <ConflictsSection conflicts={data.conflicts} participating={participatingCount(columns)} />
          </>
        )}
      </div>

      {traceColumn && (
        <RunTraceDrawer
          runId={traceColumn.run_id}
          agentName={traceColumn.agent_name}
          prNumber={data.pr_number}
          findings={traceColumn.findings}
          running={traceColumn.status === "running"}
          onClose={() => setTrace(null)}
        />
      )}
    </AppShell>
  );
}
