/* PathRef — one cited repo path, shared by the critical-paths "Open" button,
   the guided-reading path link and the architecture overview's path chips
   (AC-17, AC-22, AC-25, AC-26). With a clone it is a GitHub blob link pinned
   to the tour commit (UT-11: `githubBlobUrl` percent-encodes each segment);
   without a clone (EC-3) it falls back to plain, non-interactive text. */
"use client";

import type { CSSProperties, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { githubBlobUrl } from "@/lib/github-urls";
import { s } from "./styles";

export interface PathRefProps {
  path: string;
  repoFullName: string;
  tourCommit: string;
  cloned: boolean;
  /** Visible content; defaults to the path itself. */
  children?: ReactNode;
  /** Only critical-paths and guided-reading entries carry this (AC-28, EC-29). */
  importerCount?: number | null;
  style?: CSSProperties;
}

export function PathRef({ path, repoFullName, tourCommit, cloned, children, importerCount, style }: PathRefProps) {
  const t = useTranslations("onboarding");
  const content = children ?? path;
  const importedBy =
    importerCount != null && importerCount >= 1 ? (
      <span style={s.importedBy}>{t("paths.importedBy", { count: importerCount })}</span>
    ) : null;

  if (!cloned) {
    return (
      <span style={s.wrap}>
        <span className="mono" title={path} style={{ ...s.text, ...style }}>
          {content}
        </span>
        {importedBy}
      </span>
    );
  }

  return (
    <span style={s.wrap}>
      <a
        href={githubBlobUrl(repoFullName, tourCommit, path)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t("actions.openAria", { path })}
        title={path}
        className="mono"
        style={{ ...s.link, ...style }}
      >
        {content}
      </a>
      {importedBy}
    </span>
  );
}
