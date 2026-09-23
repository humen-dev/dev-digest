/* VersionsTab — full history (newest first). Each row leads with the author's
   version message (typed in the Config tab when saving the body) over the date,
   and carries Diff (modal reusing diff-viewer's parsePatch + CodeLine over
   GET .../diff) and Restore (confirm → POST .../restore → a new version with the
   old body; history stays append-only — nothing is deleted). The current version
   shows only a `Current` badge: it has no Diff (the endpoint compares against the
   current body, so its own patch is always empty) and nothing to restore to. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useRestoreSkillVersion, useSkillVersions } from "../../../../../../../lib/hooks/skills";
import { VersionDiffModal } from "./_components/VersionDiffModal";
import { s } from "./styles";

const pad = (n: number) => String(n).padStart(2, "0");

/** `YYYY-MM-DD` in the viewer's own timezone; the exact instant stays on hover. */
function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

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
        <h2 style={s.h2}>{t("versionsTab.title")}</h2>
        <Badge color="var(--text-secondary)">{t("versionsTab.count", { count: sorted.length })}</Badge>
      </div>
      <p style={s.caption}>{t("versionsTab.caption")}</p>

      {isLoading && <div style={s.empty}>…</div>}

      {sorted.map((v) => {
        const isCurrent = v.version === current;
        return (
          <div key={v.version} style={s.row}>
            <Badge
              mono
              color={isCurrent ? "var(--accent-text)" : "var(--text-secondary)"}
              bg={isCurrent ? "var(--accent-bg)" : "var(--bg-hover)"}
            >
              v{v.version}
            </Badge>

            <div style={s.meta}>
              {v.message ? (
                <span style={s.message} title={v.message}>
                  {v.message}
                </span>
              ) : (
                <span style={s.noMessage}>{t("versionsTab.noMessage")}</span>
              )}
              <span style={s.date} title={new Date(v.created_at).toLocaleString()}>
                {fmtDate(v.created_at)}
              </span>
            </div>

            {isCurrent ? (
              <Badge dot color="var(--ok)" bg="var(--ok-bg)">
                {t("versionsTab.current")}
              </Badge>
            ) : (
              <div style={s.actions}>
                <Button kind="secondary" size="sm" icon="Eye" onClick={() => setDiffVersion(v.version)}>
                  {t("versionsTab.diff")}
                </Button>
                <Button
                  kind="secondary"
                  size="sm"
                  icon="History"
                  onClick={() => doRestore(v.version)}
                  disabled={restore.isPending}
                >
                  {restore.isPending ? t("versionsTab.restoring") : t("versionsTab.restore")}
                </Button>
              </div>
            )}
          </div>
        );
      })}

      {diffVersion != null && (
        <VersionDiffModal skillId={skill.id} version={diffVersion} onClose={() => setDiffVersion(null)} />
      )}
    </div>
  );
}
