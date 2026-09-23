/* ConventionsView — the Conventions board of the Skills Lab: run a scan of the
   active repo, triage the candidate house rules, and merge the accepted ones
   into a skill. Rejected rules stay in a collapsed section so a re-scan can be
   shown not to resurrect them. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { ApiError } from "@/lib/api";
import { formatCost } from "@/lib/format-cost";
import { relativeTime } from "@/lib/relative-time";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import {
  useBulkUpdateConventions,
  useConventions,
  useExtractConventions,
  useUpdateConvention,
} from "@/lib/hooks/conventions";
import { SKELETON_CARDS } from "../../constants";
import { acceptedIds, splitCandidates } from "../../helpers";
import { ConventionCard } from "../ConventionCard";
import { CreateSkillFromConventionsModal } from "../CreateSkillFromConventionsModal";
import { s } from "./styles";

export function ConventionsView({ repoId }: { repoId: string }) {
  const t = useTranslations("conventions");
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data: board, isLoading, isError, error, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const update = useUpdateConvention(repoId);
  const bulk = useBulkUpdateConventions(repoId);
  const [showRejected, setShowRejected] = React.useState(false);
  const [creating, setCreating] = React.useState(false);

  const repoName = activeRepo?.name ?? activeRepo?.full_name ?? t("page.repoFallback");
  const scan = board?.last_scan ?? null;
  const { active, rejected } = splitCandidates(board?.candidates ?? []);
  const accepted = acceptedIds(board?.candidates ?? []);
  const busy = update.isPending || bulk.isPending || extract.isPending;
  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const scanLabel = extract.isPending
    ? t("page.scanning")
    : scan
      ? t("page.rescan")
      : t("page.runScan");

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>
              {t("page.headingPrefix")}
              <span className="mono" style={s.repoName}>
                {repoName}
              </span>
            </h1>
            <p style={s.subtitle}>
              {scan
                ? t("page.subtitleScanned", {
                    files: scan.sampled_files.length,
                    when: relativeTime(scan.created_at),
                  })
                : t("page.subtitle")}
            </p>
            {extract.isPending && <p style={s.scanningHint}>{t("page.scanningHint")}</p>}
          </div>
          <Button
            kind="primary"
            icon={scan ? "RefreshCw" : "Sparkles"}
            loading={extract.isPending}
            onClick={() => extract.mutate()}
          >
            {scanLabel}
          </Button>
        </div>

        {scan && (
          <div style={s.summary}>
            <span>
              {t("page.summary", {
                proposed: scan.proposed,
                ungrounded: scan.dropped_ungrounded,
                duplicate: scan.dropped_duplicate,
                rare: scan.dropped_rare,
                kept: scan.kept,
              })}
            </span>
            <span className="mono" style={s.summaryMeta}>
              {t("page.summaryMeta", { model: scan.model, cost: formatCost(scan.api_cost_usd) })}
            </span>
          </div>
        )}

        {isLoading ? (
          <div style={s.list}>
            {Array.from({ length: SKELETON_CARDS }).map((_, i) => (
              <Skeleton key={i} height={168} />
            ))}
          </div>
        ) : isError ? (
          <ErrorState
            body={error instanceof ApiError ? error.message : t("page.loadError")}
            onRetry={() => refetch()}
          />
        ) : (
          <>
            {active.length > 0 && (
              <>
                <div style={s.toolbar}>
                  <Button
                    kind="ghost"
                    size="sm"
                    icon="X"
                    disabled={busy || accepted.length === 0}
                    onClick={() => bulk.mutate({ ids: accepted, status: "pending" })}
                  >
                    {t("toolbar.deselectAll")}
                  </Button>
                  <span style={s.acceptedCount}>
                    {t("toolbar.acceptedCount", { accepted: accepted.length, total: active.length })}
                  </span>
                  {accepted.length > 0 && (
                    <Button kind="primary" size="sm" icon="Sparkles" onClick={() => setCreating(true)}>
                      {t("toolbar.createSkill")}
                    </Button>
                  )}
                </div>
                <div style={s.list}>
                  {active.map((c) => (
                    <ConventionCard
                      key={c.id}
                      candidate={c}
                      repoFullName={activeRepo?.full_name}
                      gitRef={scan?.head_sha ?? activeRepo?.default_branch}
                      busy={busy}
                      onPatch={(patch) => update.mutate({ id: c.id, patch })}
                    />
                  ))}
                </div>
              </>
            )}

            {active.length === 0 &&
              (scan ? (
                <EmptyState
                  icon="ListChecks"
                  title={t("page.emptyAfterScan.title")}
                  body={t("page.emptyAfterScan.body")}
                />
              ) : (
                <EmptyState
                  icon="ListChecks"
                  title={t("page.empty.title")}
                  body={t("page.empty.body")}
                  cta={t("page.empty.cta")}
                  ctaLoading={extract.isPending}
                  onCta={() => extract.mutate()}
                />
              ))}

            {rejected.length > 0 && (
              <div style={s.rejected}>
                <button
                  type="button"
                  style={s.rejectedToggle}
                  aria-expanded={showRejected}
                  onClick={() => setShowRejected((v) => !v)}
                >
                  {showRejected ? <Icon.ChevronDown size={14} /> : <Icon.ChevronRight size={14} />}
                  {t("rejected.title", { count: rejected.length })}
                </button>
                {showRejected && (
                  <>
                    <p style={s.rejectedHint}>{t("rejected.hint")}</p>
                    <div style={s.list}>
                      {rejected.map((c) => (
                        <ConventionCard
                          key={c.id}
                          candidate={c}
                          repoFullName={activeRepo?.full_name}
                          gitRef={scan?.head_sha ?? activeRepo?.default_branch}
                          busy={busy}
                          onPatch={(patch) => update.mutate({ id: c.id, patch })}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {creating && (
        <CreateSkillFromConventionsModal
          repoId={repoId}
          repoName={repoName}
          onClose={() => setCreating(false)}
        />
      )}
    </AppShell>
  );
}
