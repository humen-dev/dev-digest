/* SeverityFilterBar — aggregate "3 CRITICAL · 5 WARNING · 2 SUGGESTION" counters
   across all review runs. Clicking a level filters the findings below to that
   severity only; clicking the active level again clears back to "all". */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Severity } from "@devdigest/shared";
import { SEV_COLOR, SEV_COLOR_FALLBACK } from "../FindingCard/constants";
import { SEVERITY_LEVELS, type SeverityCounts } from "../FindingsTab/helpers";
import { s, chipStyle } from "./styles";

const LABEL_KEY: Record<Severity, string> = {
  CRITICAL: "severityBar.critical",
  WARNING: "severityBar.warning",
  SUGGESTION: "severityBar.suggestion",
};

export function SeverityFilterBar({
  counts,
  active,
  onSelect,
}: {
  counts: SeverityCounts;
  active: Severity | null;
  onSelect: (sev: Severity | null) => void;
}) {
  const t = useTranslations("prReview");

  return (
    <div style={s.bar} role="group" aria-label={t("severityBar.groupLabel")}>
      {SEVERITY_LEVELS.map((sev, i) => {
        const color = SEV_COLOR[sev] ?? SEV_COLOR_FALLBACK;
        const count = counts[sev];
        const disabled = count === 0;
        const isActive = active === sev;
        const label = t(LABEL_KEY[sev]);
        return (
          <React.Fragment key={sev}>
            {i > 0 && <span style={s.sep} aria-hidden>·</span>}
            <button
              type="button"
              disabled={disabled}
              aria-pressed={isActive}
              aria-label={t("severityBar.aria", { severity: label })}
              onClick={() => onSelect(isActive ? null : sev)}
              style={chipStyle(color, isActive, disabled)}
            >
              <span className="mono">{count}</span> {label}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default SeverityFilterBar;
