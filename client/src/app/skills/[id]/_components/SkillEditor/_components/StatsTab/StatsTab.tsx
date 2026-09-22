/* StatsTab — exactly the four tiles the DB can back: USED BY (agent_count),
   VERSIONS (skill_versions row count), BODY TOKENS (body_tokens), SOURCE.
   Deliberately no PULL FREQUENCY / ACCEPT RATE tiles or a findings-by-category
   chart — findings have no skill_id and prompt_assembly.skills is unindexed
   text, so there's nothing honest to compute there yet (see plan §4 Stats tab). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillAgents, useSkillVersions } from "../../../../../../../lib/hooks/skills";
import { s } from "./styles";

export function StatsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: agents } = useSkillAgents(skill.id);
  const { data: versions } = useSkillVersions(skill.id);

  const tiles: { label: string; value: React.ReactNode }[] = [
    { label: t("stats.usedBy"), value: skill.agent_count },
    { label: t("stats.versions"), value: versions?.length ?? "—" },
    { label: t("stats.bodyTokens"), value: skill.body_tokens },
    { label: t("stats.source"), value: t(`listItem.source.${skill.source}`) },
  ];

  return (
    <div style={s.wrap}>
      <div style={s.tiles}>
        {tiles.map((tile) => (
          <div key={tile.label} style={s.tile}>
            <div style={s.tileLabel}>{tile.label}</div>
            <div style={s.tileVal}>{tile.value}</div>
          </div>
        ))}
      </div>
      <div style={s.card}>
        <div style={s.cardTitle}>{t("stats.agentsUsing")}</div>
        {(agents?.length ?? 0) === 0 ? (
          <div style={s.empty}>{t("stats.noAgents")}</div>
        ) : (
          agents!.map((a) => (
            <div key={a.id} style={s.agentRow}>
              <span style={s.agentName}>{a.name}</span>
              <Button kind="secondary" size="sm" onClick={() => router.push(`/agents/${a.id}?tab=skills`)}>
                {t("stats.open")}
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
