/* IntentCard — shows the PR's classified intent/scope (§3.6 GET/POST /pulls/:id/intent).
   `full` renders on the Overview tab (summary, scope lists, sources, footer);
   `compact` renders atop the Findings tab (summary + badges + "View details").
   Detection is a user action (POST), never triggered automatically by this
   component — the empty state's "Detect intent" button is the only way it fires
   from here (the review path auto-detects server-side, see run-executor). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Card, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { relativeTime } from "@/lib/relative-time";
import { usePrIntent, useDetectIntent } from "@/lib/hooks/intent";
import { IntentScopeLists } from "./_components/IntentScopeLists";
import { IntentSources } from "./_components/IntentSources";
import { IntentNotices } from "./_components/IntentNotices";
import { confidenceTone, unresolvedSources } from "./helpers";
import { s } from "./styles";

export interface IntentCardProps {
  prId: string | null;
  variant: "full" | "compact";
  /** Compact card only: jump to the full card (Overview tab). */
  onViewDetails?: () => void;
}

export function IntentCard({ prId, variant, onViewDetails }: IntentCardProps) {
  const t = useTranslations("brief");
  const { data, isLoading, isError, error, refetch } = usePrIntent(prId);
  const detect = useDetectIntent(prId);

  if (isLoading) {
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

  if (isError) {
    return (
      <Card>
        <ErrorState
          title={t("intentCard.error.load")}
          body={error instanceof ApiError ? error.message : undefined}
          onRetry={() => refetch()}
        />
      </Card>
    );
  }

  const intent = data?.intent ?? null;
  const modelErrorCode = detect.error instanceof ApiError ? detect.error.code : undefined;

  if (!intent) {
    return (
      <Card>
        <EmptyState
          icon="Sparkles"
          title={t("intentCard.empty.title")}
          body={t("intentCard.empty.body")}
          cta={t("intentCard.detect")}
          ctaLoading={detect.isPending}
          onCta={() => detect.mutate()}
        />
        {detect.isError && <DetectError code={modelErrorCode} message={detect.error?.message} />}
      </Card>
    );
  }

  const stale = data?.stale ?? false;
  const tone = confidenceTone(intent.confidence);
  const unresolved = unresolvedSources(intent.sources);

  return (
    <Card>
      <div style={s.header}>
        <div style={s.title}>
          <Icon.Sparkles size={16} />
          {t("intentCard.title")}
        </div>
        <div style={s.headerBadges}>
          <Badge color={tone.color} bg={tone.bg}>
            {t(`intentCard.confidence.${intent.confidence}`)}
          </Badge>
          {stale && (
            <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
              {t("intentCard.stale.title")}
            </Badge>
          )}
        </div>
      </div>

      <p style={s.summary}>&ldquo;{intent.intent}&rdquo;</p>

      <IntentNotices
        stale={stale}
        oldSha={intent.head_sha}
        newSha={data?.current_head_sha ?? ""}
        confidence={intent.confidence}
        missingContext={intent.missing_context}
        unresolved={unresolved}
      />

      {variant === "full" ? (
        <>
          <div style={s.scopeGrid}>
            <IntentScopeLists inScope={intent.in_scope} outOfScope={intent.out_of_scope} />
          </div>
          <IntentSources sources={intent.sources} />
          <div style={s.footer}>
            {intent.model && <span className="mono">{intent.model}</span>}
            <span>{relativeTime(intent.updated_at)}</span>
            <div style={s.footerSpacer} />
            <div aria-live="polite">
              <Button
                kind="ghost"
                size="sm"
                icon="RefreshCw"
                loading={detect.isPending}
                disabled={detect.isPending}
                onClick={() => detect.mutate()}
              >
                {detect.isPending ? t("intentCard.detecting") : t("intentCard.redetect")}
              </Button>
            </div>
          </div>
        </>
      ) : (
        <div style={s.compactActions}>
          <Button kind="ghost" size="sm" onClick={onViewDetails}>
            {t("intentCard.viewDetails")}
          </Button>
        </div>
      )}

      {detect.isError && <DetectError code={modelErrorCode} message={detect.error?.message} />}
    </Card>
  );
}

function DetectError({ code, message }: { code: string | undefined; message: string | undefined }) {
  const t = useTranslations("brief");
  return (
    <div role="alert" style={s.alert}>
      <Icon.AlertTriangle size={15} />
      <span>
        {code === "model_not_configured" ? t("intentCard.error.modelNotConfigured") : message ?? t("intentCard.error.detect")}
        {code === "model_not_configured" && (
          <>
            {" "}
            <a href="/settings/models" style={s.alertLink}>
              {t("intentCard.error.settingsLink")}
            </a>
          </>
        )}
      </span>
    </div>
  );
}
