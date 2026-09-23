/* SkillCard — mono name, enabled toggle, delete, description, type badge, source
   badge (an extra "Imported" badge for imported_file — untrusted origin), agent
   count. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useDeleteSkill } from "../../../../lib/hooks/skills";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  onClick,
  onToggle,
  onDeleted,
}: {
  skill: Skill;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
  onDeleted?: () => void;
}) {
  const t = useTranslations("skills");
  const del = useDeleteSkill();
  const isImported = skill.source === "imported_file";
  return (
    <div onClick={onClick} style={s.card(!!active, skill.enabled)}>
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Sparkles size={15} />
        </div>
        <span className="mono" style={s.name}>
          {skill.name}
        </span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(t("listItem.deleteConfirm", { name: skill.name })))
              del.mutate(skill.id, { onSuccess: () => onDeleted?.() });
          }}
          disabled={del.isPending}
          title={t("listItem.delete")}
          aria-label={t("listItem.delete")}
          style={s.deleteBtn(del.isPending)}
        >
          <Icon.Trash size={14} style={del.isPending ? s.deleteSpinner : undefined} />
        </button>
      </div>
      <div style={s.description}>{skill.description}</div>
      <div style={s.metaRow}>
        <Badge color="var(--text-secondary)">{t(`listItem.type.${skill.type}`)}</Badge>
        <Badge color={isImported ? "var(--warn)" : "var(--text-muted)"} bg={isImported ? "var(--warn-bg)" : undefined}>
          {t(`listItem.source.${skill.source}`)}
        </Badge>
        <Badge color="var(--text-secondary)" icon="Users">
          {t("listItem.agentCount", { count: skill.agent_count })}
        </Badge>
      </div>
    </div>
  );
}
