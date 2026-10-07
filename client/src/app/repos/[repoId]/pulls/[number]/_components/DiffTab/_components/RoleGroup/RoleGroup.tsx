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
import type { DiffTarget } from "@/lib/pr-diff-target";
import { ROLE_META } from "../../constants";
import { s, chevronFor, swatchFor } from "./styles";

export function RoleGroup({
  role,
  files,
  flaggedCount,
  commenting,
  findings,
  target,
}: {
  role: SmartDiffRole;
  files: PrFile[];
  flaggedCount: number;
  commenting?: DiffCommentApi;
  findings?: DiffFindingOverlay;
  /** Deep-link target (SPEC-04): a group holding the target file opens. */
  target?: DiffTarget | null;
}) {
  const t = useTranslations("prReview");
  const meta = ROLE_META[role];
  const hasTarget = !!target && files.some((f) => f.path === target.file);
  const [open, setOpen] = React.useState(meta.defaultOpen || hasTarget);
  // Still toggleable: only a (new) target forces the group open.
  React.useEffect(() => {
    if (hasTarget) setOpen(true);
  }, [hasTarget, target?.file, target?.line]);
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
          <DiffViewer files={files} commenting={commenting} findings={findings} target={target} />
        </div>
      )}
    </div>
  );
}
