"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { BriefProvenance } from "@devdigest/shared";
import { parseMissingSource } from "../../helpers";
import { s } from "../../styles";

interface MissingDataNoteProps {
  missing: BriefProvenance["missing_sources"];
  dropped: BriefProvenance["dropped_inputs"];
  /** Runs intent detection; the button shows only for `intent_not_detected`. */
  onDetectIntent: () => void;
  detecting: boolean;
}

/** What the brief was built without: missing sources and inputs dropped by the budget. */
export function MissingDataNote({ missing, dropped, onDetectIntent, detecting }: MissingDataNoteProps) {
  const t = useTranslations("brief");
  if (missing.length === 0 && dropped.length === 0) return null;

  return (
    <div role="status" style={s.missing}>
      <div style={s.sectionLabel}>{t("missing.title")}</div>
      <ul style={s.list}>
        {missing.map((value) => {
          const view = parseMissingSource(value);
          const text =
            view.kind === "known"
              ? t(`missing.${view.key}`)
              : view.kind === "degraded"
                ? t("missing.blast_degraded", { reason: view.reason })
                : view.raw;
          return (
            <li key={value} style={s.listItem}>
              <span>{text}</span>
              {value === "intent_not_detected" && (
                <Button kind="ghost" size="sm" loading={detecting} onClick={onDetectIntent}>
                  {t("intentCard.detect")}
                </Button>
              )}
            </li>
          );
        })}
        {dropped.map((d) => (
          <li key={`${d.kind}:${d.id}`} style={s.listItem}>
            {t(`dropped.${d.kind}`, { id: d.id })}
          </li>
        ))}
      </ul>
    </div>
  );
}
