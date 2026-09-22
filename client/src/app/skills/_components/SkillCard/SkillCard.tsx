/* SkillCard — mono name, enabled toggle, description, type badge, source badge
   (an extra "Imported" badge for imported_file — untrusted origin), agent count. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  onClick,
  onToggle,
}: {
  skill: Skill;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
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
