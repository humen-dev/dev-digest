"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Card, Icon } from "@devdigest/ui";
import { ContextPicker } from "../ContextPicker";
import { s } from "../../styles";

interface BriefEmptyProps {
  prId: string;
  repoId: string;
  picked: string[] | null;
  onPick: (paths: string[]) => void;
  onGenerate: () => void;
  generating: boolean;
  /** Generation is impossible (no provider key). */
  disabled: boolean;
}

/** "No brief yet" card with Generate and the context picker. */
export function BriefEmpty({ prId, repoId, picked, onPick, onGenerate, generating, disabled }: BriefEmptyProps) {
  const t = useTranslations("brief");
  return (
    <Card>
      <div style={s.emptyWrap}>
        <Icon.Sparkles size={22} />
        <div style={s.emptyTitle}>{t("empty.title")}</div>
        <p style={s.emptyBody}>{t("empty.body")}</p>
        <div style={s.actionsRow}>
          <Button kind="primary" icon="Sparkles" loading={generating} disabled={disabled} onClick={onGenerate}>
            {t("actions.generate")}
          </Button>
          <ContextPicker prId={prId} repoId={repoId} picked={picked} onChange={onPick} disabled={disabled} />
        </div>
      </div>
    </Card>
  );
}
