/* FindingsCell — the PR-list FINDINGS column: per-severity icon+count badges
   with a hover popover previewing the PR's findings. Renders "—" when a PR has
   no findings yet (never reviewed). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SeverityBadge, type Severity } from "@devdigest/ui";
import type { Finding } from "@devdigest/shared";
import { FindingsHoverCard } from "../FindingsHoverCard";
import { FindingsPreviewList } from "../FindingsPreviewList";

const LEVELS: Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];

export function FindingsCell({ findings }: { findings?: Finding[] | null }) {
  const t = useTranslations("prReview");
  const items = findings ?? [];
  if (items.length === 0) return <span style={{ color: "var(--text-muted)" }}>—</span>;

  const counts: Record<string, number> = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of items) if (f.severity in counts) counts[f.severity] = (counts[f.severity] ?? 0) + 1;

  return (
    <FindingsHoverCard
      width={380}
      panel={<FindingsPreviewList findings={items} title={t("findingsPreview.count", { count: items.length })} />}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        {LEVELS.filter((sev) => (counts[sev] ?? 0) > 0).map((sev) => (
          <SeverityBadge key={sev} severity={sev} compact count={counts[sev] ?? 0} />
        ))}
      </span>
    </FindingsHoverCard>
  );
}

export default FindingsCell;
