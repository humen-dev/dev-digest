/* StatRow — icon + number + label per stat, with the Tree | Graph toggle on the right. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { BlastRadiusResponse } from "@devdigest/shared";
import type { BlastView } from "../../constants";
import { ViewToggle } from "../ViewToggle";
import { s } from "./styles";

interface StatRowProps {
  stats: BlastRadiusResponse["stats"];
  view: BlastView;
  onViewChange: (view: BlastView) => void;
}

export function StatRow({ stats, view, onViewChange }: StatRowProps) {
  const t = useTranslations("blast");
  const items = [
    ["symbols", stats.symbols, Icon.Code],
    ["callers", stats.callers, Icon.CornerDownRight],
    ["endpoints", stats.endpoints, Icon.Globe],
    ["crons", stats.crons, Icon.Clock],
  ] as const;

  return (
    <div style={s.row}>
      {items.map(([key, n, StatIcon]) => (
        <span key={key} style={s.stat}>
          <span style={s.icon} aria-hidden="true">
            <StatIcon size={13} />
          </span>
          <span style={s.num}>{n}</span>
          <span>{t(`stat.${key}`, { count: n })}</span>
        </span>
      ))}
      <div style={s.toggle}>
        <ViewToggle view={view} onChange={onViewChange} />
      </div>
    </div>
  );
}
