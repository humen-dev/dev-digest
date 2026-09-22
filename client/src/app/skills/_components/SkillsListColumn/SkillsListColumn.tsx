/* SkillsListColumn — search + "Add Skill" dropdown (create from scratch / import
   from file) + the stacked SkillCards. The left rail on /skills/[id], mirroring
   agents/[id]/page.tsx's agent rail. Owns its own `useSkills()` fetch so both
   /skills (redirect-only) and /skills/[id] can mount it without prop drilling. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Skeleton, Icon } from "@devdigest/ui";
import { useCreateSkill, useSkills, useUpdateSkill } from "../../../../lib/hooks/skills";
import { SkillCard } from "../SkillCard";
import { ImportSkillDrawer } from "./_components/ImportSkillDrawer";
import { filterSkills } from "./helpers";
import { s } from "./styles";

export function SkillsListColumn({
  activeId,
  onSelect,
}: {
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations("skills");
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const create = useCreateSkill();
  const [search, setSearch] = React.useState("");
  const [importing, setImporting] = React.useState(false);

  const list = filterSkills(skills ?? [], search);

  const createFromScratch = async () => {
    const skill = await create.mutateAsync({
      name: t("page.defaultName"),
      description: "",
      type: "custom",
      body: "",
      source: "manual",
    });
    onSelect(skill.id);
  };

  return (
    <div style={s.col}>
      <div style={s.header}>
        <h1 style={s.h1}>{t("page.heading")}</h1>
        <Dropdown
          width={220}
          align="right"
          trigger={
            <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
              {t("page.addSkill")}
            </Button>
          }
          items={[
            { label: t("page.menu.create"), icon: "Edit", onClick: () => void createFromScratch() },
            { label: t("page.menu.fromFile"), icon: "Upload", onClick: () => setImporting(true) },
          ]}
        />
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
            onCta={() => setImporting(true)}
          />
        )}
        {list.map((sk) => (
          <SkillCard
            key={sk.id}
            skill={sk}
            active={sk.id === activeId}
            onClick={() => onSelect(sk.id)}
            onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
          />
        ))}
      </div>
      {importing && (
        <ImportSkillDrawer
          onClose={() => setImporting(false)}
          onImported={(id) => {
            setImporting(false);
            onSelect(id);
          }}
        />
      )}
    </div>
  );
}
