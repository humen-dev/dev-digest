/* /skills — Skills list. SkillCards + create/import. Clicking a card previews
   the skill in a side panel; the full 4-tab editor at /skills/:id is one click
   further, so browsing the list never costs a route change. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Skeleton, Icon } from "@devdigest/ui";
import { AppShell } from "../../../../components/app-shell";
import { useSkills, useUpdateSkill } from "../../../../lib/hooks/skills";
import { SkillCard } from "../SkillCard";
import { ImportSkillDrawer } from "../SkillsListColumn/_components/ImportSkillDrawer";
import { filterSkills } from "../SkillsListColumn/helpers";
import { CreateSkillModal } from "./_components/CreateSkillModal";
import { SkillPreviewPanel } from "./_components/SkillPreviewPanel";
import { s } from "./styles";

export function SkillsListView() {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const [search, setSearch] = React.useState("");
  const [importing, setImporting] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [previewId, setPreviewId] = React.useState<string | null>(null);

  const list = filterSkills(skills ?? [], search);
  const previewed = list.find((sk) => sk.id === previewId) ?? null;

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
          <Dropdown
            width={220}
            align="right"
            trigger={
              <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                {t("page.addSkill")}
              </Button>
            }
            items={[
              { label: t("page.menu.create"), icon: "Edit", onClick: () => setCreating(true) },
              { label: t("page.menu.fromFile"), icon: "Upload", onClick: () => setImporting(true) },
            ]}
          />
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
            onCta={() => setImporting(true)}
          />
        )}
        {list.length > 0 && (
          <div style={s.grid}>
            {list.map((sk) => (
              <SkillCard
                key={sk.id}
                skill={sk}
                active={sk.id === previewId}
                onClick={() => setPreviewId(sk.id)}
                onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
                onDeleted={() => setPreviewId((id) => (id === sk.id ? null : id))}
              />
            ))}
          </div>
        )}
      </div>
      {previewed && (
        <SkillPreviewPanel
          skill={previewed}
          onClose={() => setPreviewId(null)}
          onOpenEditor={() => open(previewed.id)}
        />
      )}
      {creating && (
        <CreateSkillModal
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            open(id);
          }}
        />
      )}
      {importing && (
        <ImportSkillDrawer
          onClose={() => setImporting(false)}
          onImported={(id) => {
            setImporting(false);
            open(id);
          }}
        />
      )}
    </AppShell>
  );
}
