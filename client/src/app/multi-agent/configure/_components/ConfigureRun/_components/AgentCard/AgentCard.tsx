"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { formatAgentEstimate } from "@/lib/multi-agent-selection";
import { s } from "./styles";

/** One selectable agent: checkbox, name, description and run estimate. Names and
    descriptions are user content — rendered as text only. */
export function AgentCard({ agent, on, onToggle }: { agent: Agent; on: boolean; onToggle: () => void }) {
  const t = useTranslations("multiAgent.picker");
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      onClick={onToggle}
      style={{ ...s.card, ...(on ? s.cardOn : s.cardOff) }}
    >
      <span style={{ ...s.box, ...(on ? s.boxOn : s.boxOff) }}>
        {on && <Icon.Check size={12} style={s.check} />}
      </span>
      <span style={s.text}>
        <span style={s.name}>{agent.name}</span>
        {agent.description && <span style={s.description}>{agent.description}</span>}
      </span>
      <span className="mono" style={s.estimate}>
        {formatAgentEstimate(agent) ?? t("noHistory")}
      </span>
    </button>
  );
}
