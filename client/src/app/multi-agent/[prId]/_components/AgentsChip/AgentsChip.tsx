/* "+N agents" chip on a finding that other agents flagged too. Opening it lists
   every original finding of the match group (agent, severity, title, rationale).
   All text is rendered as plain text — titles and rationales are untrusted. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SEV } from "@devdigest/ui";
import { otherAgentCount } from "./helpers";
import { s } from "./styles";
import type { GroupMember } from "./types";

export function AgentsChip({ members, runId }: { members: GroupMember[]; runId: string }) {
  const t = useTranslations("multiAgent.results");
  const [open, setOpen] = React.useState(false);
  const count = otherAgentCount(members, runId);
  if (count < 1) return null;

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        style={s.chip}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {t("chip", { count })}
      </button>
      {open && (
        <ul style={s.list} onClick={(e) => e.stopPropagation()}>
          {members.map((m) => (
            <li key={m.finding.id} style={s.item}>
              <div style={s.itemHead}>
                <span style={s.agent}>{m.agentName}</span>
                <span style={s.severity}>{SEV[m.finding.severity]?.label ?? m.finding.severity}</span>
                <span style={s.title}>{m.finding.title}</span>
              </div>
              <p style={s.rationale}>{m.finding.rationale}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
