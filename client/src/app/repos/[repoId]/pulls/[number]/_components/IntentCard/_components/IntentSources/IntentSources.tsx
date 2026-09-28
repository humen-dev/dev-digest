"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { IntentSource } from "@devdigest/shared";
import { reasonKey } from "../../helpers";
import { SOURCE_KIND_ICON } from "../../constants";
import { s } from "../../styles";

interface IntentSourcesProps {
  sources: IntentSource[];
}

/** Every signal the classifier looked at — kind + ref, unresolved ones flagged with their reason. */
export function IntentSources({ sources }: IntentSourcesProps) {
  const t = useTranslations("brief");
  if (sources.length === 0) return null;
  return (
    <div>
      <div style={s.sectionLabel}>{t("intentCard.sources")}</div>
      <ul style={s.sourcesList}>
        {sources.map((source, i) => {
          const KindIcon = Icon[SOURCE_KIND_ICON[source.kind]];
          return (
            <li key={`${source.kind}-${source.ref}-${i}`} style={s.sourceItem}>
              <KindIcon size={14} style={s.sourceKind} />
              <span style={s.sourceKind}>{t(`intentCard.kind.${source.kind}`)}</span>
              <span className="mono">{source.ref}</span>
              {source.status === "unresolved" && source.reason && (
                <>
                  <Icon.AlertTriangle size={13} style={{ color: "var(--warn)", flexShrink: 0 }} />
                  <span style={s.sourceReason}>{t(`intentCard.${reasonKey(source.reason)}`)}</span>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
