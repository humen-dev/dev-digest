"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { s } from "./styles";

interface IntentScopeListsProps {
  inScope: string[];
  outOfScope: string[];
}

/** The intent's declared in-scope / out-of-scope bullet lists, side by side. */
export function IntentScopeLists({ inScope, outOfScope }: IntentScopeListsProps) {
  const t = useTranslations("brief");
  if (inScope.length === 0 && outOfScope.length === 0) return null;
  return (
    <>
      {inScope.length > 0 && (
        <div>
          <div style={s.label}>{t("intentCard.inScope")}</div>
          <ul style={s.list}>
            {inScope.map((item, i) => (
              <li key={i} style={s.item}>
                <Icon.Check size={14} style={s.checkIcon} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {outOfScope.length > 0 && (
        <div>
          <div style={s.label}>{t("intentCard.outOfScope")}</div>
          <ul style={s.list}>
            {outOfScope.map((item, i) => (
              <li key={i} style={s.item}>
                <Icon.X size={14} style={s.crossIcon} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
