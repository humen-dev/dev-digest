/* /skills — redirects to the first skill, or shows an empty state with the
   same "create from scratch" / "import from file" actions as the list rail. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "../../components/app-shell";
import { useCreateSkill, useSkills } from "../../lib/hooks/skills";
import { ImportSkillDrawer } from "./_components/SkillsListColumn/_components/ImportSkillDrawer";

export default function SkillsIndexPage() {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const create = useCreateSkill();
  const [importing, setImporting] = React.useState(false);

  React.useEffect(() => {
    if (skills && skills.length > 0) router.replace(`/skills/${skills[0]!.id}`);
  }, [skills, router]);

  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }];

  const createFromScratch = async () => {
    const skill = await create.mutateAsync({
      name: t("page.defaultName"),
      description: "",
      type: "custom",
      body: "",
      source: "manual",
    });
    router.push(`/skills/${skill.id}`);
  };

  if (isError) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState fullScreen body={t("page.loadError")} onRetry={() => refetch()} />
      </AppShell>
    );
  }

  // Loading, or a redirect to the first skill is about to happen — show a
  // skeleton rather than flashing the empty state.
  if (isLoading || (skills && skills.length > 0)) {
    return (
      <AppShell crumb={crumb}>
        <div style={{ padding: 28 }}>
          <Skeleton height={24} width={240} />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <EmptyState
        icon="Sparkles"
        title={t("page.empty.title")}
        body={t("page.empty.body")}
        cta={t("page.empty.cta")}
        onCta={() => setImporting(true)}
      />
      <div style={{ display: "flex", justifyContent: "center", marginTop: -8 }}>
        <Button kind="ghost" icon="Edit" onClick={() => void createFromScratch()} disabled={create.isPending}>
          {t("page.menu.create")}
        </Button>
      </div>
      {importing && (
        <ImportSkillDrawer
          onClose={() => setImporting(false)}
          onImported={(id) => router.push(`/skills/${id}`)}
        />
      )}
    </AppShell>
  );
}
