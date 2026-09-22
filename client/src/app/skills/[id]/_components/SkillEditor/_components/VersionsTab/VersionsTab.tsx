/* VersionsTab — full history (newest first), `Current` on the newest, per-row
   Diff (modal reusing diff-viewer's parsePatch + CodeLine over GET .../diff)
   and Restore (confirm → POST .../restore → a new version with the old body;
   history stays append-only — nothing is deleted). No change-title field per
   row: the schema doesn't have one and we're not adding a migration for it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useRestoreSkillVersion, useSkillVersions } from "../../../../../../../lib/hooks/skills";
import { VersionDiffModal } from "./_components/VersionDiffModal";
import { s } from "./styles";

export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { data: versions, isLoading } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion();
  const [diffVersion, setDiffVersion] = React.useState<number | null>(null);

  const sorted = [...(versions ?? [])].sort((a, b) => b.version - a.version);
  const current = sorted[0]?.version ?? skill.version;

  const doRestore = (version: number) => {
    if (typeof window !== "undefined" && !window.confirm(t("versionsTab.restoreConfirm", { version }))) return;
    restore.mutate({ id: skill.id, version });
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("tabs.versions")}</h2>
        <Badge color="var(--text-secondary)">{t("versionsTab.count", { count: sorted.length })}</Badge>
      </div>
      <p style={s.caption}>{t("versionsTab.caption")}</p>

      {isLoading && <div style={s.empty}>…</div>}

      {sorted.map((v) => (
        <div key={v.version} style={s.row}>
          <Badge mono color="var(--accent-text)" bg="var(--accent-bg)">
            v{v.version}
          </Badge>
          <span style={s.date}>{new Date(v.created_at).toLocaleString()}</span>
          {v.version === current && (
            <Badge color="var(--ok)" bg="var(--ok-bg)">
              {t("versionsTab.current")}
            </Badge>
          )}
          <div style={s.actions}>
            <Button kind="secondary" size="sm" onClick={() => setDiffVersion(v.version)}>
              {t("versionsTab.diff")}
            </Button>
            {v.version !== current && (
              <Button kind="secondary" size="sm" onClick={() => doRestore(v.version)} disabled={restore.isPending}>
                {restore.isPending ? t("versionsTab.restoring") : t("versionsTab.restore")}
              </Button>
            )}
          </div>
        </div>
      ))}

      {diffVersion != null && (
        <VersionDiffModal skillId={skill.id} version={diffVersion} onClose={() => setDiffVersion(null)} />
      )}
    </div>
  );
}
