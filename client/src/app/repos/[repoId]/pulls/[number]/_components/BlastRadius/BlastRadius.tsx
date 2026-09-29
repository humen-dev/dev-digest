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
import { StatRow } from "./_components/StatRow";
import { BlastGraph } from "./_components/BlastGraph";
import { DegradedNotice } from "./_components/DegradedNotice";
import {
  BLAST_RESYNC_POLL_MAX,
  BLAST_RESYNC_POLL_MS,
  DEFAULT_EXPANDED_ROWS,
  DEFAULT_VIEW,
  type BlastView,
} from "./constants";
import { indirectBySymbol } from "./helpers";
import { s } from "./styles";

export interface BlastRadiusProps {
  prId: string | null;
  repoId: string;
  repoFullName: string | null;
  headSha: string | null;
}

export function BlastRadius({ prId, repoId, repoFullName, headSha }: BlastRadiusProps) {
  const t = useTranslations("blast");
  const [view, setView] = useState<BlastView>(DEFAULT_VIEW);
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

  // A failed background refetch keeps the last good map on screen; the error
  // card only replaces the content when there is nothing to show.
  if (!data) {
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
  const indirect = indirectBySymbol(data);

  return (
    <Card>
      <div style={s.header}>
        <div style={s.label}>{t("title")}</div>
        <StatRow stats={stats} view={view} onViewChange={setView} />
      </div>

      {data.degraded && (
        <DegradedNotice
          reason={data.reason}
          resyncPending={resync.isPending}
          resyncStarted={resync.isSuccess}
          onResync={startResync}
        />
      )}

      {view === "graph" ? (
        <BlastGraph data={data} />
      ) : stats.callers === 0 ? (
        <p style={s.empty}>
          {stats.symbols === 0 ? t("noChangedSymbols") : t("noDownstream", { count: stats.symbols })}
        </p>
      ) : (
        <div style={s.rows}>
          {data.downstream.map((group, i) => (
            <SymbolRow
              key={`${group.symbol}-${i}`}
              group={group}
              defaultExpanded={i < DEFAULT_EXPANDED_ROWS}
              repoFullName={repoFullName}
              headSha={headSha}
              indirect={indirect.get(group.symbol)}
              bfsDepth={data.limits?.bfs_depth}
            />
          ))}
        </div>
      )}

      {view === "tree" && data.unattributed_endpoints.length > 0 && (
        <div style={s.other}>
          <div style={s.otherLabel}>{t("otherEndpoints")}</div>
          <div style={s.chips} role="list" aria-label={t("otherEndpoints")}>
            {data.unattributed_endpoints.map((e) => (
              <span key={e} role="listitem" className="mono" style={s.endpointChip}>
                {e}
              </span>
            ))}
          </div>
        </div>
      )}

      {data.limits && (
        <p style={s.limits}>
          {t("limits", { max: data.limits.max_callers_per_symbol, depth: data.limits.bfs_depth })}
        </p>
      )}
      {/* U4 mounts <PriorPrs /> here. */}
    </Card>
  );
}
