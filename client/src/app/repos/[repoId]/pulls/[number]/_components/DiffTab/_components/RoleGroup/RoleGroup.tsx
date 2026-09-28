/* RoleGroup — one collapsible reviewer-ordered role section (core / tests /
   wiring / docs / boilerplate): coloured swatch + label + description, the
   "● N files with findings" count (findings only), then the file count, and
   (when open) the group's files rendered through DiffViewer. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type DiffFindingOverlay } from "@/components/diff-viewer";
import type { PrFile, SmartDiffRole } from "@devdigest/shared";
import { ROLE_META } from "../../constants";
import { s, chevronFor, swatchFor } from "./styles";

export function RoleGroup({
  role,
  files,
  flaggedCount,
  commenting,
  findings,
}: {
  role: SmartDiffRole;
  files: PrFile[];
  flaggedCount: number;
  commenting?: DiffCommentApi;
  findings?: DiffFindingOverlay;
}) {
  const t = useTranslations("prReview");
  const meta = ROLE_META[role];
  const [open, setOpen] = React.useState(meta.defaultOpen);
  const panelId = `role-group-${role}`;

  return (
    <div style={s.group}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        style={s.header}
      >
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <span style={swatchFor(meta.color)} />
        <span style={s.label}>{t(`smartDiff.${meta.labelKey}`)}</span>
        <span style={s.description}>{t(`smartDiff.${meta.descriptionKey}`)}</span>
        <span style={s.right}>
          {flaggedCount > 0 && (
            <span
              style={s.flagged}
              aria-label={t("smartDiff.filesWithFindings", { count: flaggedCount })}
            >
              ● {flaggedCount}
            </span>
          )}
          <span>{t("smartDiff.filesCount", { count: files.length })}</span>
        </span>
      </button>
      {open && (
        <div id={panelId} style={s.body}>
          <DiffViewer files={files} commenting={commenting} findings={findings} />
        </div>
      )}
    </div>
  );
}
