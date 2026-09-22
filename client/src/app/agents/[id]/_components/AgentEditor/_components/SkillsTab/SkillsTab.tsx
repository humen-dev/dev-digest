/* SkillsTab — checklist of every workspace skill (Checkbox = linked or not).
   Order (only meaningful among linked skills) is native HTML5 drag-and-drop
   PLUS ↑/↓ buttons as a keyboard-accessible alternative — there's no DnD
   library in this client and one isn't worth adding for a single list. Any
   change fires a full set-replace `POST /agents/:id/skills { skill_ids }`,
   which is already implemented server-side (A2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Checkbox, IconBtn, ErrorState } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentSkills, useSetAgentSkills, useSkills } from "../../../../../../../lib/hooks/skills";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const { data: skills, isLoading: skillsLoading, isError, refetch } = useSkills();
  const { data: links, isLoading: linksLoading } = useAgentSkills(agent.id);
  const setSkills = useSetAgentSkills();

  const [linkedIds, setLinkedIds] = React.useState<string[]>([]);
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);

  // Seed local order from the server once links load (and whenever the agent
  // or its links change under us — e.g. another tab linked a skill).
  React.useEffect(() => {
    if (links) setLinkedIds([...links].sort((a, b) => a.order - b.order).map((l) => l.skill_id));
  }, [agent.id, links]);

  const skillById = React.useMemo(() => new Map((skills ?? []).map((sk) => [sk.id, sk])), [skills]);
  const unlinked = (skills ?? []).filter((sk) => !linkedIds.includes(sk.id));

  const commit = (next: string[]) => {
    setLinkedIds(next);
    setSkills.mutate({ agentId: agent.id, skillIds: next });
  };

  const toggleLink = (skillId: string, linked: boolean) => {
    commit(linked ? [...linkedIds, skillId] : linkedIds.filter((id) => id !== skillId));
  };

  const move = (index: number, dir: -1 | 1) => {
    const to = index + dir;
    if (to < 0 || to >= linkedIds.length) return;
    const next = [...linkedIds];
    const [item] = next.splice(index, 1);
    next.splice(to, 0, item!);
    commit(next);
  };

  const onDrop = (index: number) => {
    if (dragIndex == null || dragIndex === index) return;
    const next = [...linkedIds];
    const [item] = next.splice(dragIndex, 1);
    next.splice(index, 0, item!);
    setDragIndex(null);
    commit(next);
  };

  if (isError) return <ErrorState body={t("skills.loadError")} onRetry={() => refetch()} />;
  if (skillsLoading || linksLoading) return <div style={s.empty}>…</div>;

  return (
    <div style={s.wrap}>
      <div style={s.headerRow}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <span style={s.count}>
          {t("skills.enabledCount", { linked: linkedIds.length, total: skills?.length ?? 0 })}
        </span>
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>

      {(skills?.length ?? 0) === 0 ? (
        <div style={s.empty}>{t("skills.empty")}</div>
      ) : (
        <div style={s.list}>
          {linkedIds.map((id, i) => {
            const sk = skillById.get(id);
            if (!sk) return null;
            return (
              <div
                key={id}
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(i)}
                style={s.row}
              >
                <span style={s.dragHandle} aria-hidden="true">
                  ⠿
                </span>
                <Checkbox checked label={<span className="mono">{sk.name}</span>} onChange={(v) => toggleLink(id, v)} />
                <span style={s.spacer} />
                <IconBtn icon="ArrowUp" label={t("skills.moveUp")} onClick={() => move(i, -1)} />
                <IconBtn icon="ArrowDown" label={t("skills.moveDown")} onClick={() => move(i, 1)} />
              </div>
            );
          })}
          {unlinked.map((sk) => (
            <div key={sk.id} style={s.row}>
              <span style={s.dragHandle} aria-hidden="true" />
              <Checkbox checked={false} label={<span className="mono">{sk.name}</span>} onChange={(v) => toggleLink(sk.id, v)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
