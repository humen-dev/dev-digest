/* FindingsPreviewList — the body of a findings hover popover: a severity-sorted
   list of compact finding previews. Shared by the PR-list FINDINGS cell and the
   Agent-runs timeline row. Presentational only — the caller supplies the title
   string (i18n) and the popover chrome comes from FindingsHoverCard. */
"use client";

import React from "react";
import { SeverityBadge, CategoryTag, ConfidenceNum, type Severity, type Category } from "@devdigest/ui";
import type { Finding } from "@devdigest/shared";
import { s } from "./styles";

/** Severity display order (most severe first). */
const ORDER: Record<string, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2, INFO: 3 };

export function FindingsPreviewList({ findings, title }: { findings: Finding[]; title: string }) {
  const sorted = React.useMemo(
    () => [...findings].sort((a, b) => (ORDER[a.severity] ?? 9) - (ORDER[b.severity] ?? 9)),
    [findings],
  );

  return (
    <div>
      <div style={s.title}>{title}</div>
      <div style={s.list}>
        {sorted.map((f) => (
          <div key={f.id} style={s.item}>
            <div style={s.itemHead}>
              <span style={{ flexShrink: 0, display: "inline-flex" }}>
                <SeverityBadge severity={f.severity as Severity} compact />
              </span>
              <span style={s.itemTitle}>{f.title}</span>
            </div>
            <div style={s.meta}>
              <CategoryTag category={f.category as Category} />
              <span className="mono" style={s.loc}>
                {f.file}:{f.start_line}
                {f.end_line !== f.start_line ? `-${f.end_line}` : ""}
              </span>
              <ConfidenceNum value={f.confidence} />
            </div>
            <div style={s.rationale}>{f.rationale}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default FindingsPreviewList;
