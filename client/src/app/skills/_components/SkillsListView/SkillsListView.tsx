/* /skills — Skills list. SkillCards + create/import. No skill is selected here;
   clicking a card opens the editor at /skills/:id straight away. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton, Icon } from "@devdigest/ui";
import { AppShell } from "../../../../components/app-shell";
import { useSkills, useUpdateSkill } from "../../../../lib/hooks/skills";
import { SkillCard } from "../SkillCard";
import { AddSkillModal } from "../AddSkillModal";
import { filterSkills } from "../SkillsListColumn/helpers";
import { s } from "./styles";

export function SkillsListView() {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const [search, setSearch] = React.useState("");
  const [addTab, setAddTab] = React.useState<string | null>(null);

  const list = filterSkills(skills ?? [], search);

  const open = (id: string) => router.push(`/skills/${id}?tab=config`);

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("page.heading")}</h1>
            <p style={s.subtitle}>{t("page.subtitle")}</p>
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
          <Button kind="primary" size="sm" icon="Plus" onClick={() => setAddTab("create")}>
            {t("page.addSkill")}
          </Button>
        </div>

        {isLoading && (
          <div style={s.grid}>
            <Skeleton height={120} />
            <Skeleton height={120} />
            <Skeleton height={120} />
          </div>
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
        {list.length > 0 && (
          <div style={s.grid}>
            {list.map((sk) => (
              <SkillCard
                key={sk.id}
                skill={sk}
                onClick={() => open(sk.id)}
                onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
              />
            ))}
          </div>
        )}
      </div>
      {addTab && (
        <AddSkillModal
          initialTab={addTab}
          onClose={() => setAddTab(null)}
          onAdded={(id) => {
            setAddTab(null);
            open(id);
          }}
        />
      )}
    </AppShell>
  );
}
