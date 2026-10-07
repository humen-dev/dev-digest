/* PrBriefSection — the PR Brief block on the Overview tab (SPEC-04).
   Reopening a stored brief is a plain GET (0 model calls); generating is always a
   user action (POST). Branches on `!data` first: a failed background refetch keeps
   the last good brief on screen (client/INSIGHTS.md, 2026-09-29). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, ErrorState } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { useDetectIntent } from "@/lib/hooks/intent";
import { usePrBrief, useGenerateBrief } from "@/lib/hooks/brief";
import { useSecretsStatus, useSettings } from "@/lib/hooks/core";
import { usePrReviews } from "@/lib/hooks/reviews";
import { BriefBanner } from "./_components/BriefBanner";
import { BriefEmpty } from "./_components/BriefEmpty";
import { BriefNotice } from "./_components/BriefNotice";
import { BriefSkeleton } from "./_components/BriefSkeleton";
import { ContextDocsUsed } from "./_components/ContextDocsUsed";
import { MissingDataNote } from "./_components/MissingDataNote";
import { latestReview, missingKeyProvider, outcomeReasonKey, regenerateBody, shortSha } from "./helpers";
import { s } from "./styles";

export interface PrBriefSectionProps {
  prId: string;
  repoId: string;
}

export function PrBriefSection({ prId, repoId }: PrBriefSectionProps) {
  const t = useTranslations("brief");
  const { data, isError, refetch } = usePrBrief(prId);
  const generate = useGenerateBrief(prId);
  const detect = useDetectIntent(prId);
  const { data: settings } = useSettings();
  const { data: secrets } = useSecretsStatus();
  const { data: reviews } = usePrReviews(prId);
  const [picked, setPicked] = React.useState<string[] | null>(null);

  if (!data) {
    if (!isError) return <BriefSkeleton />;
    return (
      <Card>
        <ErrorState title={t("error.load")} onRetry={() => refetch()} />
      </Card>
    );
  }

  const stored = data.brief && data.provenance ? { brief: data.brief, provenance: data.provenance } : null;
  const pending = generate.isPending;
  if (!stored && (pending || data.status === "generating")) return <BriefSkeleton />;

  const missingKey = missingKeyProvider(settings, secrets);
  const result = generate.data;
  const outcome = result && (result.status === "refused" || result.status === "failed") ? result : null;
  const retry = () => generate.mutate(generate.variables ?? {});

  let notice: React.ReactNode = null;
  if (generate.isError) {
    const code = generate.error instanceof ApiError ? generate.error.code : undefined;
    notice = (
      <BriefNotice
        message={generate.error.message || t("failed.title")}
        settingsLink={code === "model_not_configured"}
        onRetry={retry}
        retrying={pending}
      />
    );
  } else if (outcome) {
    const reasonKey = outcomeReasonKey(outcome.status as "refused" | "failed", outcome.reason);
    const message =
      outcome.status === "refused"
        ? t(reasonKey ?? "failed.title")
        : [t("failed.title"), reasonKey ? t(reasonKey) : null].filter(Boolean).join(" ");
    notice = <BriefNotice message={message} onRetry={retry} retrying={pending} />;
  }

  const keyNotice = missingKey ? (
    <BriefNotice message={t("noKey", { provider: missingKey })} settingsLink />
  ) : null;

  if (!stored) {
    return (
      <div style={s.stack}>
        {keyNotice}
        {notice}
        <BriefEmpty
          prId={prId}
          repoId={repoId}
          picked={picked}
          onPick={setPicked}
          onGenerate={() => generate.mutate(picked ? { context_paths: picked } : {})}
          generating={pending}
          disabled={missingKey !== null}
        />
      </div>
    );
  }

  const { brief, provenance } = stored;
  const droppedPaths = provenance.dropped_inputs.filter((d) => d.kind === "context_doc").map((d) => d.id);
  const outdatedLabel =
    data.status === "outdated"
      ? t("outdated", { oldSha: shortSha(provenance.head_sha), newSha: shortSha(data.current_head_sha) })
      : null;

  return (
    <div style={s.stack}>
      {keyNotice}
      {notice}
      <BriefBanner
        summary={brief.summary}
        provenance={provenance}
        review={latestReview(reviews)}
        outdatedLabel={outdatedLabel}
        regenerating={pending || data.status === "generating"}
        regenerateDisabled={missingKey !== null}
        onRegenerate={() => generate.mutate(regenerateBody(provenance))}
      />
      <MissingDataNote
        missing={provenance.missing_sources}
        dropped={provenance.dropped_inputs}
        onDetectIntent={() => detect.mutate()}
        detecting={detect.isPending}
      />
      <ContextDocsUsed docs={provenance.context_docs} droppedPaths={droppedPaths} />
    </div>
  );
}
