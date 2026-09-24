/* SkillsTab — every workspace skill with a toggle that attaches it to this
   agent, its type rubric, and a filter box. Order (only meaningful among
   attached skills) is native HTML5 drag-and-drop PLUS ↑/↓ buttons as a
   keyboard-accessible alternative — there's no DnD library in this client and
   one isn't worth adding for a single list. Any change fires a full set-replace
   `POST /agents/:id/skills { skill_ids }`, which is already implemented
   server-side (A2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, IconBtn, Icon, Toggle } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentSkills, useSetAgentSkills, useSkills } from "../../../../../../../lib/hooks/skills";
import { s } from "./styles";
import { reorderEnabledSkills } from "./helpers";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const { data: skills, isLoading: skillsLoading, isError, refetch } = useSkills();
  const { data: links, isLoading: linksLoading } = useAgentSkills(agent.id);
  const setSkills = useSetAgentSkills();

  const [linkedIds, setLinkedIds] = React.useState<string[]>([]);
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState("");

  // Seed local order from the server once links load (and whenever the agent
  // or its links change under us — e.g. another tab linked a skill).
  React.useEffect(() => {
    if (links) setLinkedIds([...links].sort((a, b) => a.order - b.order).map((l) => l.skill_id));
  }, [agent.id, links]);

  const skillById = React.useMemo(() => new Map((skills ?? []).map((sk) => [sk.id, sk])), [skills]);
  const enabledIds = linkedIds.filter((id) => skillById.get(id)?.enabled);
  const query = filter.trim().toLowerCase();
  const matches = (id: string) => !query || (skillById.get(id)?.name.toLowerCase().includes(query) ?? false);
  const unlinked = (skills ?? []).filter((sk) => !linkedIds.includes(sk.id) && matches(sk.id));

  const commit = (next: string[]) => {
    setLinkedIds(next);
    setSkills.mutate({ agentId: agent.id, skillIds: next });
  };

  const toggleLink = (skillId: string, linked: boolean) => {
    commit(linked ? [...linkedIds, skillId] : linkedIds.filter((id) => id !== skillId));
  };

  // Work with stable IDs and the full active order, even when search hides rows.
  const reorder = (fromId: string, toId: string) => {
    const next = reorderEnabledSkills(linkedIds, enabledIds, fromId, toId);
    if (next !== linkedIds) commit(next);
  };

  const move = (id: string, dir: -1 | 1) => {
    const index = enabledIds.indexOf(id);
    const target = index < 0 ? undefined : enabledIds[index + dir];
    if (target) reorder(id, target);
  };

  const onDrop = (id: string) => {
    if (dragId) reorder(dragId, id);
    setDragId(null);
  };

  if (isError) return <ErrorState body={t("skills.loadError")} onRetry={() => refetch()} />;
  if (skillsLoading || linksLoading) return <div style={s.empty}>…</div>;

  return (
    <div style={s.wrap}>
      <div style={s.headerRow}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <span style={s.count}>
          {t("skills.enabledCount", { linked: enabledIds.length, total: skills?.length ?? 0 })}
        </span>
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>

      <div style={s.search}>
        <Icon.Search size={13} style={s.searchIcon} />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("skills.filterPlaceholder")}
          aria-label={t("skills.filterPlaceholder")}
          style={s.searchInput}
        />
      </div>

      {(skills?.length ?? 0) === 0 ? (
        <div style={s.empty}>{t("skills.empty")}</div>
      ) : (
        <div style={s.list}>
          {linkedIds.map((id) => {
            const sk = skillById.get(id);
            if (!sk || !matches(id)) return null;
            const position = enabledIds.indexOf(id);
            return (
              <div
                key={id}
                draggable={sk.enabled}
                onDragStart={(e) => {
                  if (!sk.enabled) { e.preventDefault(); return; }
                  setDragId(id);
                  e.dataTransfer?.setData("text/plain", id);
                }}
                onDragEnd={() => setDragId(null)}
                onDragOver={(e) => { if (sk.enabled && dragId) e.preventDefault(); }}
                onDrop={() => onDrop(id)}
                style={s.row(sk.enabled)}
              >
                <span style={s.dragHandle} aria-hidden="true">
                  {sk.enabled ? "⠿" : ""}
                </span>
                <Toggle on size={14} label={sk.name} onChange={(v) => toggleLink(id, v)} />
                <span className="mono" style={s.name}>
                  {sk.name}
                </span>
                <Badge color="var(--text-secondary)">{t(`skills.type.${sk.type}`)}</Badge>
                <span style={s.spacer} />
                {sk.enabled ? (
                  <>
                    <span style={s.count}>#{position + 1}</span>
                    <IconBtn icon="ArrowUp" label={t("skills.moveUp")} onClick={() => move(id, -1)} />
                    <IconBtn icon="ArrowDown" label={t("skills.moveDown")} onClick={() => move(id, 1)} />
                  </>
                ) : <Badge color="var(--text-muted)">{t("skills.globallyDisabled")}</Badge>}
              </div>
            );
          })}
          {unlinked.map((sk) => (
            <div key={sk.id} style={s.row(false)}>
              <span style={s.dragHandle} aria-hidden="true" />
              <Toggle on={false} size={14} label={sk.name} onChange={(v) => toggleLink(sk.id, v)} />
              <span className="mono" style={s.name}>
                {sk.name}
              </span>
              <Badge color="var(--text-secondary)">{t(`skills.type.${sk.type}`)}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
