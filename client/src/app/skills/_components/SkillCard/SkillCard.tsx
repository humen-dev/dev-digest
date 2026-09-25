/* SkillCard — mono name, enabled toggle, delete, description, type badge, source
   badge (an extra "Imported" badge for imported_file — untrusted origin),
   current version and agent count. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ConfirmDialog } from "../../../../components/confirm-dialog";
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
  const [confirming, setConfirming] = React.useState(false);
  const isImported = skill.source === "imported_file";
  const blocked = !!skill.injection_detected;
  return (
    <div onClick={onClick} style={s.card(!!active, skill.enabled, blocked)}>
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Sparkles size={15} />
        </div>
        <span className="mono" style={s.name}>
          {skill.name}
        </span>
        {blocked && (
          <Badge color="var(--crit)" bg="var(--crit-bg)" icon="AlertTriangle">
            {t("injection.badge")}
          </Badge>
        )}
        {onToggle && !blocked && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setConfirming(true);
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
      {blocked && <div style={s.blockedNote}>{t("injection.blocked")}</div>}
      <div style={s.metaRow}>
        <Badge color="var(--text-secondary)">{t(`listItem.type.${skill.type}`)}</Badge>
        <Badge color={isImported ? "var(--warn)" : "var(--text-muted)"} bg={isImported ? "var(--warn-bg)" : undefined}>
          {t(`listItem.source.${skill.source}`)}
        </Badge>
        <Badge color="var(--text-secondary)" icon="Users">
          {t("listItem.agentCount", { count: skill.agent_count })}
        </Badge>
        <Badge color="var(--text-muted)" mono>
          {t("listItem.version", { version: skill.version })}
        </Badge>
      </div>

      {confirming && (
        <div onClick={(e) => e.stopPropagation()}>
          <ConfirmDialog
            title={t("listItem.delete")}
            body={t("listItem.deleteConfirm", { name: skill.name })}
            confirmLabel={t("listItem.confirmDelete")}
            cancelLabel={t("listItem.cancel")}
            busy={del.isPending}
            onClose={() => setConfirming(false)}
            onConfirm={() =>
              del.mutate(skill.id, {
                onSuccess: () => {
                  setConfirming(false);
                  onDeleted?.();
                },
              })
            }
          />
        </div>
      )}
    </div>
  );
}
