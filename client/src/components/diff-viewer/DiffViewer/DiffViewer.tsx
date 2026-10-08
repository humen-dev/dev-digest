/* DiffViewer — basic GitHub-style unified diff viewer. Renders real PrFile.patch
   (unified-diff text from the F1 API) as a list of collapsible FileCards.
   Optional inline comments (Files changed tab): hover a line → "+" → comment,
   posted live to GitHub; existing GitHub review comments render inline.
   Optional `findings` overlay: the caller (route) supplies markers with a
   pre-rendered card slot; DiffViewer stays agnostic of what a finding is. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { PrFile } from "@/lib/types";
import type { DiffTarget } from "@/lib/pr-diff-target";
import { type DiffCommentApi } from "../comments";
import type { DiffFindingOverlay } from "../findings";
import { s } from "../styles";
import { FileCard } from "../FileCard";

export function DiffViewer({
  files,
  commenting,
  findings,
  target,
}: {
  files: PrFile[];
  commenting?: DiffCommentApi;
  findings?: DiffFindingOverlay;
  target?: DiffTarget | null;
}) {
  const t = useTranslations("shell");
  if (!files || files.length === 0) {
    return <div style={s.empty}>{t("diffViewer.noChangedFiles")}</div>;
  }
  return (
    <div style={s.list}>
      {files.map((f) => (
        <FileCard key={f.path} file={f} commenting={commenting} findings={findings} target={target} />
      ))}
    </div>
  );
}
