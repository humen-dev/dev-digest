/* DocRow — one project document in an agent's or skill's Context tab: a
   checkbox (attach/detach), file name, folder, bucket badge, token count and
   a Preview button. A row the agent/skill attached but that no longer
   resolves swaps the checkbox for a "not found" badge and a Detach button
   (AC-26/AC-27); a row inherited only through a linked skill has no
   `onToggle` at all — its checkbox renders disabled (AC-24). Drag-and-drop
   (native HTML5, D7) and the ArrowUp/ArrowDown keyboard alternative (NFR-6)
   are wired by the parent tab, which owns the ordering state; this component
   only forwards the handlers onto the row element. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon } from "@devdigest/ui";
import type { ContextDocRow } from "@/components/context-docs/types";
import { s } from "./styles";

export function DocRow({
  row,
  onToggle,
  onDetach,
  onPreview,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onKeyDown,
  actions,
}: {
  row: ContextDocRow;
  onToggle?: (next: boolean) => void;
  onDetach?: () => void;
  onPreview: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  actions?: React.ReactNode;
}) {
  const t = useTranslations("contextDocs");
  const disabled = !onToggle;

  return (
    <div
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onDragOver={draggable ? onDragOver : undefined}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onKeyDown={onKeyDown}
      tabIndex={onKeyDown ? 0 : undefined}
      style={s.row(!!draggable)}
    >
      <span style={s.dragHandle} aria-hidden="true">
        {draggable ? "⠿" : ""}
      </span>
      {row.missing ? (
        <Badge color="var(--crit)" bg="var(--crit-bg)" icon="AlertTriangle">
          {t("row.notFound")}
        </Badge>
      ) : (
        <button
          type="button"
          role="checkbox"
          aria-checked={row.attached}
          aria-label={row.path}
          disabled={disabled}
          onClick={() => onToggle?.(!row.attached)}
          style={s.checkbox(row.attached, disabled)}
        >
          {row.attached && <Icon.Check size={11} style={{ color: "#fff" }} />}
        </button>
      )}
      <span className="mono" style={s.fileName}>
        {row.fileName}
      </span>
      {row.folder && <span style={s.folder}>{row.folder}</span>}
      <Badge color="var(--text-secondary)">{row.bucket}</Badge>
      {row.inheritedVia && <span style={s.viaSkill}>{t("row.viaSkill", { name: row.inheritedVia })}</span>}
      <span style={s.spacer} />
      {row.estimatedTokens != null && <span style={s.tokens}>{t("row.tokens", { count: row.estimatedTokens })}</span>}
      {row.missing && onDetach ? (
        <Button kind="secondary" size="sm" onClick={onDetach}>
          {t("row.detach")}
        </Button>
      ) : (
        <Button kind="tertiary" size="sm" onClick={onPreview}>
          {t("row.preview")}
        </Button>
      )}
      {actions}
    </div>
  );
}
