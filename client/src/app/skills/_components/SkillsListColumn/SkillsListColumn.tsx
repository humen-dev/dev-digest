/* SkillsListColumn — search + "Add Skill" dropdown (create from scratch / import
   from file) + the stacked SkillCards. The left rail on /skills/[id], mirroring
   agents/[id]/page.tsx's agent rail. Owns its own `useSkills()` fetch so both
   /skills (redirect-only) and /skills/[id] can mount it without prop drilling. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton, Icon } from "@devdigest/ui";
import { useSkills, useUpdateSkill } from "../../../../lib/hooks/skills";
import { SkillCard } from "../SkillCard";
import { AddSkillModal } from "../AddSkillModal";
import { filterSkills } from "./helpers";
import { s } from "./styles";

export function SkillsListColumn({
  activeId,
  onSelect,
  onDeleted,
}: {
  activeId: string | null;
  onSelect: (id: string) => void;
  onDeleted?: (id: string) => void;
}) {
  const t = useTranslations("skills");
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const [search, setSearch] = React.useState("");
  const [addTab, setAddTab] = React.useState<string | null>(null);

  const list = filterSkills(skills ?? [], search);

  return (
    <div style={s.col}>
      <div style={s.header}>
        <h1 style={s.h1}>{t("page.heading")}</h1>
        <Button kind="primary" size="sm" icon="Plus" onClick={() => setAddTab("create")}>
          {t("page.addSkill")}
        </Button>
      </div>
      <div style={s.search}>
        <Icon.Search size={13} style={s.searchIcon} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("page.searchPlaceholder")}
          style={s.searchInput}
        />
      </div>
      <div style={s.list}>
        {isLoading && (
          <>
            <Skeleton height={90} style={{ marginBottom: 10 }} />
            <Skeleton height={90} style={{ marginBottom: 10 }} />
          </>
        )}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
        {!isLoading && !isError && list.length === 0 && (
          <EmptyState
            icon="Sparkles"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            onCta={() => setAddTab("file")}
          />
        )}
        {list.map((sk) => (
          <SkillCard
            key={sk.id}
            skill={sk}
            active={sk.id === activeId}
            onClick={() => onSelect(sk.id)}
            onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
            onDeleted={() => onDeleted?.(sk.id)}
          />
        ))}
      </div>
      {addTab && (
        <AddSkillModal
          initialTab={addTab}
          onClose={() => setAddTab(null)}
          onAdded={(id) => {
            setAddTab(null);
            onSelect(id);
          }}
        />
      )}
    </div>
  );
}
