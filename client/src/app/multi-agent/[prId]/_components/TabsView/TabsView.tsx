/* Tabs mode: one tab per agent run (name + score); the active tab shows a summary
   card and the agent's findings as full FindingCards. Switching tabs is local
   state only. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { CircularScore, Tabs, type TabDef } from "@devdigest/ui";
import type { AgentColumn, FindingActionKind } from "@devdigest/shared";
import { FindingCard } from "@/components/review/FindingCard";
import { formatCost } from "@/lib/format-cost";
import { formatSeconds } from "@/lib/multi-agent-selection";
import { AgentsChip, type GroupIndex } from "../AgentsChip";
import { s } from "./styles";

export function TabsView({
  columns,
  groups,
  hideErrors,
  pending,
  onViewTrace,
  onFindingAction,
}: {
  columns: AgentColumn[];
  groups: GroupIndex;
  /** The failure is shown once above the tabs (shared pre-work), not per agent. */
  hideErrors: boolean;
  pending: boolean;
  onViewTrace: (runId: string) => void;
  onFindingAction: (findingId: string, action: "accept" | "dismiss") => void;
}) {
  const t = useTranslations("multiAgent.results");
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const current = columns.find((c) => c.run_id === activeId) ?? columns[0];
  if (!current) return null;

  const tabs: TabDef[] = columns.map((c) => ({
    key: c.run_id,
    label: c.agent_name,
    count: c.score ?? undefined,
  }));

  const handleAction = (findingId: string, action: FindingActionKind) => {
    if (action === "accept" || action === "dismiss") onFindingAction(findingId, action);
  };

  return (
    <div style={s.wrap}>
      <Tabs tabs={tabs} value={current.run_id} onChange={setActiveId} pad="0" />

      <section style={s.summary} aria-label={current.agent_name}>
        {current.score != null && <CircularScore score={current.score} size={52} stroke={4} />}
        <div style={s.summaryMain}>
          <div style={s.name}>{current.agent_name}</div>
          <div style={s.status}>{t(`status.${current.status}`)}</div>
          {current.summary && <p style={s.text}>{current.summary}</p>}
          {current.status === "failed" && !hideErrors && current.error && (
            <p style={s.error}>{current.error}</p>
          )}
        </div>
        <div style={s.side}>
          <button type="button" style={s.trace} onClick={() => onViewTrace(current.run_id)}>
            {t("viewTrace")}
          </button>
          <span>{current.duration_ms != null ? formatSeconds(current.duration_ms) : "—"}</span>
          <span>{formatCost(current.cost_usd)}</span>
        </div>
      </section>

      <div style={s.findings}>
        {current.status === "done" && current.findings.length === 0 && (
          <div style={s.empty}>{t("noFindings")}</div>
        )}
        {current.findings.map((f) => (
          <FindingCard
            key={f.id}
            f={f}
            pending={pending}
            showComingSoonActions
            badge={<AgentsChip members={groups.get(f.group_id) ?? []} runId={current.run_id} />}
            onAction={(action) => handleAction(f.id, action)}
          />
        ))}
      </div>
    </div>
  );
}
