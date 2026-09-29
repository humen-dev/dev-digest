/* BlastRadius — what else the PR can affect (GET /pulls/:id/blast): changed
   symbols, their callers as GitHub links, affected endpoints and cron jobs.
   Read-only over the repo-intel index; a degraded index shows a notice with a
   Resync action (which re-polls the map until it recovers). */
"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, ErrorState, Skeleton } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { useBlastRadius } from "@/lib/hooks/blast";
import { useResyncRepoIntel } from "@/lib/hooks/repo-intel";
import { SymbolRow } from "./_components/SymbolRow";
import { DegradedNotice } from "./_components/DegradedNotice";
import { BLAST_RESYNC_POLL_MAX, BLAST_RESYNC_POLL_MS, DEFAULT_EXPANDED_ROWS } from "./constants";
import { s } from "./styles";

export interface BlastRadiusProps {
  prId: string | null;
  repoId: string;
  repoFullName: string | null;
  headSha: string | null;
}

export function BlastRadius({ prId, repoId, repoFullName, headSha }: BlastRadiusProps) {
  const t = useTranslations("blast");
  const [pollUntil, setPollUntil] = useState<number | undefined>(undefined);
  const { data, isLoading, isError, error, refetch } = useBlastRadius(prId, {
    pollMs: pollUntil === undefined ? false : BLAST_RESYNC_POLL_MS,
    pollUntil,
  });
  const resync = useResyncRepoIntel(repoId);

  const startResync = () =>
    resync.mutate(undefined, {
      onSuccess: () => setPollUntil(Date.now() + BLAST_RESYNC_POLL_MS * BLAST_RESYNC_POLL_MAX),
    });

  if (!prId || isLoading) {
    return (
      <Card>
        <div style={s.loadingStack}>
          <Skeleton height={16} width={120} />
          <Skeleton height={14} />
          <Skeleton height={14} width="70%" />
        </div>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <ErrorState
          title={t("error.load")}
          body={error instanceof ApiError ? error.message : undefined}
          onRetry={() => refetch()}
        />
      </Card>
    );
  }

  const { stats } = data;
  const statItems = [
    ["symbols", stats.symbols],
    ["callers", stats.callers],
    ["endpoints", stats.endpoints],
    ["crons", stats.crons],
  ] as const;

  return (
    <Card>
      <div style={s.header}>
        <div style={s.label}>{t("title")}</div>
        <div style={s.stats}>
          {statItems.map(([key, n], i) => (
            <React.Fragment key={key}>
              {i > 0 && <span style={s.sep}>·</span>}
              <span>
                <span style={s.statNum}>{n}</span> {t(`stat.${key}`, { count: n })}
              </span>
            </React.Fragment>
          ))}
        </div>
      </div>

      {data.degraded && (
        <DegradedNotice
          reason={data.reason}
          resyncPending={resync.isPending}
          resyncStarted={resync.isSuccess}
          onResync={startResync}
        />
      )}

      {stats.callers === 0 ? (
        <p style={s.empty}>
          {stats.symbols === 0 ? t("noChangedSymbols") : t("noDownstream", { count: stats.symbols })}
        </p>
      ) : (
        <div style={s.rows}>
          {data.downstream.map((group, i) => (
            <SymbolRow
              key={group.symbol}
              group={group}
              defaultExpanded={i < DEFAULT_EXPANDED_ROWS}
              repoFullName={repoFullName}
              headSha={headSha}
            />
          ))}
        </div>
      )}

      {data.unattributed_endpoints.length > 0 && (
        <div style={s.other}>
          <div style={s.otherLabel}>{t("otherEndpoints")}</div>
          <div style={s.chips} role="list" aria-label={t("endpointsLabel")}>
            {data.unattributed_endpoints.map((e) => (
              <span key={e} role="listitem" className="mono" style={s.endpointChip}>
                {e}
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
