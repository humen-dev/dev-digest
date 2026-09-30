/* ViewToggle — Tree | Graph segmented radiogroup. Duplicates the DiffTab
   OrderToggle pattern on purpose (that one is a DiffTab internal). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { BLAST_VIEWS, type BlastView } from "../../constants";
import { s, pillStyle } from "./styles";

export function ViewToggle({ view, onChange }: { view: BlastView; onChange: (view: BlastView) => void }) {
  const t = useTranslations("blast");
  return (
    <div role="radiogroup" aria-label={t("view.label")} style={s.group}>
      {BLAST_VIEWS.map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={view === v}
          style={pillStyle(view === v)}
          onClick={() => onChange(v)}
        >
          {t(`view.${v}`)}
        </button>
      ))}
    </div>
  );
}
