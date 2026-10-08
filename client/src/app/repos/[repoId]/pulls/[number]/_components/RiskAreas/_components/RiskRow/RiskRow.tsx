"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { Risk } from "@devdigest/shared";
import { RISK_SEVERITY_COLOR } from "../../constants";
import { riskKindIcon } from "../../helpers";
import { s } from "../../styles";

export interface RiskRowProps {
  risk: Risk;
  expanded: boolean;
  onToggle: () => void;
  onRefClick: (ref: string) => void;
}

export function RiskRow({ risk, expanded, onToggle, onRefClick }: RiskRowProps) {
  const t = useTranslations("brief");
  const color = RISK_SEVERITY_COLOR[risk.severity];
  const KindIcon = Icon[riskKindIcon(risk.kind)];
  const firstRef = risk.file_refs[0];
  const detailsId = React.useId();

  return (
    <li>
      <div
        style={{
          ...s.pill,
          border: `1px solid ${expanded ? color : "var(--border)"}`,
          background: expanded ? "var(--bg-hover)" : "transparent",
        }}
      >
        <button
          type="button"
          style={s.pillMain}
          disabled={!firstRef}
          onClick={() => firstRef && onRefClick(firstRef)}
        >
          <span style={s.pillTitle}>
            <KindIcon size={13} style={{ color }} aria-hidden />
            {risk.title}
          </span>
          {firstRef && (
            <span className="mono" style={s.pillRef}>
              {firstRef}
            </span>
          )}
        </button>
        <button
          type="button"
          style={s.chevron}
          aria-expanded={expanded}
          aria-controls={detailsId}
          aria-label={t("risks.expand")}
          title={t("risks.expand")}
          onClick={onToggle}
        >
          <Icon.ChevronDown
            size={14}
            aria-hidden
            style={{
              color: "var(--text-muted)",
              transform: expanded ? "rotate(180deg)" : "none",
              transition: "transform .15s",
            }}
          />
        </button>
      </div>
      {expanded && (
        <div id={detailsId} style={s.details}>
          <p style={s.explanation}>{risk.explanation}</p>
          {risk.file_refs.length > 0 && (
            <div style={s.refs}>
              {risk.file_refs.map((ref) => (
                <button
                  key={ref}
                  type="button"
                  className="mono"
                  style={s.refLink}
                  onClick={() => onRefClick(ref)}
                >
                  {ref}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
