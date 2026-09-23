/* SkillPreviewPanel — the side panel the Skills list opens on card click: the
   skill's metadata and its rendered body, with one way out to the full editor.
   Reading a skill must not cost a route change. */
"use client";

import { useTranslations } from "next-intl";
import { Badge, Button, Drawer, Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { PREVIEW_PANEL_WIDTH } from "../../constants";
import { s } from "./styles";

export function SkillPreviewPanel({
  skill,
  onOpenEditor,
  onClose,
}: {
  skill: Skill;
  onOpenEditor: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("skills");

  return (
    <Drawer
      width={PREVIEW_PANEL_WIDTH}
      title={<span className="mono">{skill.name}</span>}
      subtitle={t("previewPanel.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("previewPanel.close")}
          </Button>
          <Button kind="primary" icon="Edit" onClick={onOpenEditor}>
            {t("previewPanel.openEditor")}
          </Button>
        </div>
      }
    >
      <div style={s.meta}>
        <Badge color="var(--text-secondary)">{t(`listItem.type.${skill.type}`)}</Badge>
        <Badge color="var(--text-muted)">{t(`listItem.source.${skill.source}`)}</Badge>
        <Badge color="var(--text-muted)" mono>
          {t("listItem.version", { version: skill.version })}
        </Badge>
        <Badge color="var(--text-secondary)" icon="Users">
          {t("listItem.agentCount", { count: skill.agent_count })}
        </Badge>
      </div>
      {skill.description && <p style={s.description}>{skill.description}</p>}
      <div style={s.body}>
        {skill.body.trim() ? <Markdown>{skill.body}</Markdown> : <span style={s.empty}>{t("previewPanel.empty")}</span>}
      </div>
    </Drawer>
  );
}
