/* One run of the multi-agent runs list — the whole row is a link to its results. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { MultiAgentRunsListItem } from "@devdigest/shared";
import { multiAgentResultsUrl } from "@/lib/multi-agent-urls";
import { formatSeconds } from "@/lib/multi-agent-selection";
import { relativeTime } from "@/lib/relative-time";
import { costLabel, stateLabel, visibleAgents } from "../../helpers";
import { s } from "./styles";

export function RunRow({ item }: { item: MultiAgentRunsListItem }) {
  const t = useTranslations("multiAgent");
  const { visible, overflow } = visibleAgents(item.agents);
  const state = stateLabel(item, t);

  return (
    <Link
      href={multiAgentResultsUrl(item.pr_id, item.id)}
      style={s.row}
      aria-label={t("list.rowLabel", {
        number: item.pr_number,
        title: item.pr_title,
        repo: item.repo_name,
        state,
      })}
    >
      <span style={s.title} title={item.pr_title}>
        #{item.pr_number} {item.pr_title}
      </span>
      <span style={s.muted}>{item.repo_name}</span>
      <span className="mono" style={s.muted}>
        {relativeTime(item.ran_at)}
      </span>
      <span style={s.agents}>
        {visible.map((a, i) => (
          <span key={`${a.agent_name}-${i}`}>
            {a.agent_name} <span style={s.agentStatus}>{t(`results.status.${a.status}`)}</span>
          </span>
        ))}
        {overflow > 0 && <span style={s.more}>{t("list.moreAgents", { count: overflow })}</span>}
      </span>
      <span className="mono" style={s.muted}>
        {formatSeconds(item.total_duration_ms)}
      </span>
      <span className="mono" style={s.muted}>
        {costLabel(item, t)}
      </span>
      <span style={s.state}>{state}</span>
    </Link>
  );
}
