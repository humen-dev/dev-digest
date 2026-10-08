/* DocPreviewDrawer — the full working-tree text of one project document,
   rendered exactly as the engine's prompt block would render it (plain
   `<Markdown>`, no raw-HTML plugin — hostile Markdown stays inert, UT-4),
   plus its usage ("Used by N agents") and an Attach/Attached toggle that
   drives the caller's own attached-paths list (AC-62). Shared by both
   Context tabs; the caller supplies `onToggleAttach` because only it knows
   whether this is the agent's or the skill's attachment list. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Drawer, ErrorState, Markdown, Skeleton } from "@devdigest/ui";
import { useProjectDoc, useProjectDocUsage } from "@/lib/hooks/project-context";
import { s } from "./styles";

export function DocPreviewDrawer({
  repoId,
  path,
  bucket,
  attached,
  onToggleAttach,
  onClose,
}: {
  repoId: string | null | undefined;
  path: string;
  bucket: string;
  attached: boolean;
  onToggleAttach: (next: boolean) => void;
  onClose: () => void;
}) {
  const t = useTranslations("contextDocs");
  const { data: doc, isLoading, isError, refetch } = useProjectDoc(repoId, path);
  const { data: usage } = useProjectDocUsage(repoId, path);

  return (
    <Drawer
      title={path}
      onClose={onClose}
      footer={
        <Button kind={attached ? "secondary" : "primary"} onClick={() => onToggleAttach(!attached)}>
          {attached ? t("preview.attached") : t("preview.attach")}
        </Button>
      }
    >
      <div style={s.meta}>
        <Badge color="var(--text-secondary)">{bucket}</Badge>
        <span style={s.usage}>{t("preview.usedBy", { count: usage?.agents.length ?? 0 })}</span>
        {doc && <span style={s.tokens}>{t("preview.tokens", { count: doc.estimated_tokens })}</span>}
      </div>
      {isLoading && <Skeleton height={120} />}
      {isError && <ErrorState body={t("preview.loadError")} onRetry={() => refetch()} />}
      {doc && (
        <div style={s.card}>
          {doc.text.trim() ? <Markdown>{doc.text}</Markdown> : <div style={s.empty}>{t("preview.empty")}</div>}
        </div>
      )}
    </Drawer>
  );
}
