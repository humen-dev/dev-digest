/* SkillEditor — header (icon, name, type badge, version chip, disabled badge)
   + Tabs, switching between Config/Preview/Stats/Versions. Mirrors AgentEditor,
   but this shell switches on `tab` itself (AgentEditor didn't need to until the
   Skills tab landed there too — see agents/[id]/_components/AgentEditor). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Tabs, Icon, Badge } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { StatsTab } from "./_components/StatsTab";
import { VersionsTab } from "./_components/VersionsTab";
import { TABS } from "./constants";
import { s } from "./styles";

export function SkillEditor({ skill, tab, onTab }: { skill: Skill; tab: string; onTab: (t: string) => void }) {
  const t = useTranslations("skills");
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));
  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <Icon.Sparkles size={18} style={{ color: "var(--accent)" }} />
        <h1 style={s.h1}>{skill.name}</h1>
        <Badge color="var(--text-secondary)">{t(`listItem.type.${skill.type}`)}</Badge>
        <Badge color="var(--text-secondary)" mono>
          {t("config.version", { version: skill.version })}
        </Badge>
        {!skill.enabled && <Badge color="var(--text-muted)">disabled</Badge>}
      </div>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 24px" />
      </div>
      <div style={s.body}>
        {tab === "config" && <ConfigTab skill={skill} />}
        {tab === "preview" && <PreviewTab skill={skill} />}
        {tab === "stats" && <StatsTab skill={skill} />}
        {tab === "versions" && <VersionsTab skill={skill} />}
      </div>
    </div>
  );
}
