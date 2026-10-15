"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { agentIdentity } from "./helpers";
import { s } from "./styles";

/**
 * Icon tile + name of an agent. The name is a React text child (never HTML),
 * truncated on one line; `title` exposes the full text (EC-12, UT-3).
 */
export function AgentIdentity({
  agentId,
  name,
  badge,
  sub,
}: {
  agentId: string | null;
  name: string;
  badge?: React.ReactNode;
  sub?: React.ReactNode;
}) {
  const t = useTranslations("agentPerformance");
  const { icon, color, background } = agentIdentity(agentId);
  const Glyph = Icon[icon];
  const label = agentId == null ? t("table.unknownAgent") : name;
  return (
    <div style={s.wrap}>
      <div style={s.tile(color, background)} aria-hidden="true">
        <Glyph size={15} />
      </div>
      <div style={s.text}>
        <div style={s.nameRow}>
          <span style={s.name} title={label}>
            {label}
          </span>
          {badge}
        </div>
        {sub != null && <div style={s.sub}>{sub}</div>}
      </div>
    </div>
  );
}
