/* ProjectContextEntries — per-document breakdown shown under the trace's
   project-context prompt block: one line per attached document with its
   path, counted tokens and the status a run assigned it (AC-55). Renders
   nothing when there are no entries (legacy traces, EC-15). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { ProjectContextEntry } from "@devdigest/shared";

const listStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: "6px 14px 10px",
};
const rowStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "baseline",
  fontSize: 12,
};
const pathStyle: React.CSSProperties = {
  flex: 1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "var(--text-secondary)",
};
const tokensStyle: React.CSSProperties = { color: "var(--text-muted)", flexShrink: 0 };

/** Status color: included reads as a positive signal, every skipped_* reason as neutral/muted. */
function statusColor(status: ProjectContextEntry["status"]): string {
  return status === "included" ? "var(--ok)" : "var(--text-muted)";
}

export function ProjectContextEntries({ entries }: { entries: ProjectContextEntry[] }) {
  const t = useTranslations("runs");
  if (entries.length === 0) return null;
  return (
    <div style={listStyle}>
      {entries.map((entry) => (
        <div key={entry.path} style={rowStyle}>
          <span className="mono" style={pathStyle}>
            {entry.path}
          </span>
          <span style={tokensStyle}>
            {entry.tokens != null
              ? t("trace.projectContext.tokens", { tokens: entry.tokens })
              : t("trace.projectContext.tokensUnknown")}
          </span>
          <span style={{ color: statusColor(entry.status), flexShrink: 0 }}>
            {t(`trace.projectContext.status.${entry.status}`)}
          </span>
        </div>
      ))}
    </div>
  );
}
