"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button } from "@devdigest/ui";
import type { BlastDegradedReason } from "@devdigest/shared";
import { isKnownReason } from "../../helpers";
import { s } from "./styles";

interface DegradedNoticeProps {
  reason: BlastDegradedReason | null;
  resyncPending: boolean;
  resyncStarted: boolean;
  onResync: () => void;
}

export function DegradedNotice({ reason, resyncPending, resyncStarted, onResync }: DegradedNoticeProps) {
  const t = useTranslations("blast");
  // Resync cannot fix a disabled feature flag.
  const canResync = reason !== "flag_off";

  return (
    <div style={s.notice} role="status">
      <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
        {t("degraded.badge")}
      </Badge>
      <span style={s.text}>
        {isKnownReason(reason) ? t(`degraded.reason.${reason}`) : t("degraded.reason.no_data")}
      </span>
      {resyncStarted && <span style={s.started}>{t("resync.started")}</span>}
      {canResync && (
        <Button
          kind="ghost"
          size="sm"
          icon="RefreshCw"
          loading={resyncPending}
          disabled={resyncPending}
          onClick={onResync}
        >
          {resyncPending ? t("resync.pending") : t("resync.button")}
        </Button>
      )}
    </div>
  );
}
