"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { BriefProvenance } from "@devdigest/shared";
import { TOKEN_UNIT } from "../../constants";
import { s } from "../../styles";

interface ContextDocsUsedProps {
  docs: BriefProvenance["context_docs"];
  /** Paths of context documents dropped by the prompt budget. */
  droppedPaths: string[];
}

/** Context documents the brief was grounded on, and the ones the budget cut. */
export function ContextDocsUsed({ docs, droppedPaths }: ContextDocsUsedProps) {
  const t = useTranslations("brief");
  if (docs.length === 0 && droppedPaths.length === 0) return null;

  return (
    <div style={s.docs}>
      {docs.length > 0 && (
        <>
          <div style={s.sectionLabel}>{t("context.used")}</div>
          <ul style={s.list}>
            {docs.map((d) => (
              <li key={d.path} style={s.listItem}>
                <span className="mono">{d.path}</span>
                {d.tokens != null && (
                  <span style={s.muted}>
                    {d.tokens.toLocaleString("en-US")} {TOKEN_UNIT}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {droppedPaths.length > 0 && (
        <>
          <div style={s.sectionLabel}>{t("context.droppedByBudget")}</div>
          <ul style={s.list}>
            {droppedPaths.map((p) => (
              <li key={p} style={s.listItem}>
                <span className="mono">{p}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
