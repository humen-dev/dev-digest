/* RunEvalControl — "Run all evals" for one agent (SPEC-05 AC-31, AC-32, AC-74, EC-6, EC-25).
   Confirm with the case count from the estimate, then POST; while a run is in
   progress the start action is replaced by an indicator with the start time and
   the run is polled (useEvalRun). A polite live region announces the status. */
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { EvalAgentDetail } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useEvalEstimate, useEvalRun, useStartEvalRun } from "@/lib/hooks/eval";
import { runErrorKey, runErrorValues } from "@/lib/eval-errors";
import { s } from "./styles";

export function RunEvalControl({ agentId, detail }: { agentId: string; detail: EvalAgentDetail }) {
  const t = useTranslations("eval");
  const tc = useTranslations("common");
  const [confirming, setConfirming] = useState(false);
  const [startedId, setStartedId] = useState<string | null>(null);
  const start = useStartEvalRun(agentId);
  const estimate = useEvalEstimate(agentId, confirming);

  const activeId = detail.running?.id ?? startedId;
  const runQuery = useEvalRun(activeId);
  const run = runQuery.data ?? (detail.running?.id === activeId ? detail.running : null);
  const running = run?.status === "running";

  const startError = start.error;
  const startCode = startError instanceof ApiError ? startError.code : undefined;
  const startDetails = startError instanceof ApiError ? startError.details : undefined;
  const failedReason = run?.status === "errored" ? run.error_reason : null;

  function confirmStart() {
    start.mutate(undefined, {
      onSuccess: (r) => setStartedId(r.run_id),
      onSettled: () => setConfirming(false),
    });
  }

  const announcement = run && !running ? t(`status.${run.status}`) : running ? t("run.runningSince") : "";

  return (
    <div style={s.wrap}>
      <div role="status" aria-live="polite" style={s.live}>
        {announcement}
      </div>

      {running && run ? (
        <div style={s.row}>
          <span style={s.running}>{t("status.running")}</span>
          <time dateTime={run.started_at} style={s.muted}>
            {new Date(run.started_at).toLocaleTimeString()}
          </time>
          <span style={s.muted}>{t("run.runningSince")}</span>
        </div>
      ) : confirming ? (
        <div style={s.confirm}>
          <span>
            {estimate.data
              ? t("run.confirmOne", { count: estimate.data.cases_total })
              : estimate.isError
                ? t("errors.generic")
                : tc("states.loading")}
          </span>
          <Button size="sm" kind="primary" icon="Play" disabled={!estimate.data || start.isPending} onClick={confirmStart}>
            {t("run.start")}
          </Button>
          <Button size="sm" kind="ghost" onClick={() => setConfirming(false)}>
            {tc("actions.cancel")}
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          kind="secondary"
          icon="Play"
          disabled={start.isPending}
          onClick={() => {
            start.reset();
            setConfirming(true);
          }}
        >
          {t("run.start")}
        </Button>
      )}

      {startError && (
        <span role="alert" style={s.error}>
          {t(`errors.${runErrorKey(startCode)}`, runErrorValues(startDetails))}
        </span>
      )}
      {failedReason && !startError && (
        <span role="alert" style={s.error}>
          {t(`errors.${runErrorKey(failedReason)}`, runErrorValues(null))}
        </span>
      )}
      {runQuery.isError && activeId && (
        <span role="alert" style={s.muted}>
          {t("run.refreshFailed")}
        </span>
      )}
    </div>
  );
}
