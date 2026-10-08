"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import { SETTINGS_MODELS_HREF } from "../../constants";
import { s } from "../../styles";

interface BriefNoticeProps {
  message: string;
  /** Shows a Retry button when given. */
  onRetry?: () => void;
  retrying?: boolean;
  /** Adds the Settings → Models link (missing provider key). */
  settingsLink?: boolean;
}

/** Inline error call-out above the brief: refused, failed, HTTP error, missing key. */
export function BriefNotice({ message, onRetry, retrying, settingsLink }: BriefNoticeProps) {
  const t = useTranslations("brief");
  return (
    <div role="alert" style={s.notice}>
      <Icon.AlertTriangle size={15} />
      <span style={s.noticeText}>
        {message}
        {settingsLink && (
          <>
            {" "}
            <a href={SETTINGS_MODELS_HREF} style={s.link}>
              {t("actions.settingsLink")}
            </a>
          </>
        )}
      </span>
      {onRetry && (
        <Button kind="ghost" size="sm" icon="RefreshCw" loading={retrying} onClick={onRetry}>
          {t("actions.retry")}
        </Button>
      )}
    </div>
  );
}
