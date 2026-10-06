/* ContextTab (agent) — every repo project doc, with a checkbox that attaches
   it to this agent, its bucket, token estimate and a Preview drawer. Order
   (meaningful only among attached docs) is native HTML5 drag-and-drop plus
   Move up/down buttons (D7) — same pattern as the Skills tab's SkillsTab. A
   doc reached only through a linked skill renders read-only ("via skill
   <name>"); one the agent attached but that no longer resolves shows "not
   found" + Detach instead of a checkbox (D6, AC-24/AC-26/AC-27). The footer
   total and over-budget badge come from the server's effective-context
   preview, which both this tab and the run executor compute through the same
   `ProjectContextService.resolveEffective` (AC-33 parity, by construction). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, IconBtn, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useActiveRepo } from "@/lib/repo-context";
import {
  useAgentContextDocs,
  useAgentContextPreview,
  useProjectDocs,
  useSetAgentContextDocs,
} from "@/lib/hooks/project-context";
import { DocFilter } from "@/components/context-docs/DocFilter";
import { DocPreviewDrawer } from "@/components/context-docs/DocPreviewDrawer";
import { DocRow } from "@/components/context-docs/DocRow";
import { DocsEmptyState } from "@/components/context-docs/DocsEmptyState";
import { buildAgentContextRows, isOverTokenThreshold, matchesFilter, moveAttached, reorderAttached } from "@/components/context-docs/helpers";
import { s } from "./styles";

export function ContextTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const { repoId } = useActiveRepo();
  const { data: docsList, isLoading: docsLoading, isError: docsError, refetch: refetchDocs } = useProjectDocs(repoId);
  const { data: attached, isLoading: attachedLoading } = useAgentContextDocs(agent.id);
  const setAttached = useSetAgentContextDocs(agent.id);
  const { data: preview } = useAgentContextPreview(agent.id, repoId);

  const [filter, setFilter] = React.useState("");
  const [dragPath, setDragPath] = React.useState<string | null>(null);
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);
  const [lastAttempt, setLastAttempt] = React.useState<string[] | null>(null);

  const attachedPaths = attached?.paths ?? [];
  const docs = docsList?.documents ?? [];
  const rows = React.useMemo(
    () => buildAgentContextRows(docs, attachedPaths, preview?.documents),
    [docs, attachedPaths, preview?.documents],
  );
  const visibleRows = rows.filter((r) => matchesFilter(r, filter));

  const commit = (next: string[]) => {
    setLastAttempt(next);
    setAttached.mutate(next);
  };

  const toggle = (path: string, next: boolean) => {
    commit(next ? [...attachedPaths, path] : attachedPaths.filter((p) => p !== path));
  };

  const detach = (path: string) => commit(attachedPaths.filter((p) => p !== path));

  const move = (path: string, dir: -1 | 1) => {
    const index = attachedPaths.indexOf(path);
    const next = moveAttached(attachedPaths, index, index + dir);
    if (next !== attachedPaths) commit(next);
  };

  const onDrop = (toPath: string) => {
    if (dragPath) {
      const next = reorderAttached(attachedPaths, dragPath, toPath);
      if (next !== attachedPaths) commit(next);
    }
    setDragPath(null);
  };

  const previewRow = previewPath ? rows.find((r) => r.path === previewPath) : undefined;

  if (docsLoading || attachedLoading) {
    return (
      <div style={s.wrap}>
        <div style={s.skeletonWrap}>
          <Skeleton height={16} width={160} />
          <Skeleton height={60} />
          <Skeleton height={60} />
        </div>
      </div>
    );
  }

  if (docsError) {
    return <DocsEmptyState kind="error" title={t("context.loadError")} onCta={() => refetchDocs()} />;
  }

  if (docsList?.cloned === false) {
    return <DocsEmptyState kind="not-cloned" title={t("context.notClonedTitle")} body={t("context.notClonedBody")} />;
  }

  const overBudget = preview ? isOverTokenThreshold(preview.total_tokens) : false;

  return (
    <div style={s.wrap}>
      <div style={s.headerRow}>
        <h2 style={s.h2}>{t("context.title")}</h2>
        <span style={s.count}>{t("context.attachedCount", { attached: attachedPaths.length, total: docs.length })}</span>
      </div>
      <p style={s.hint}>{t("context.helper")}</p>

      <DocFilter value={filter} onChange={setFilter} placeholder={t("context.filterPlaceholder")} />

      {docs.length === 0 ? (
        <DocsEmptyState
          kind="empty"
          icon="FileText"
          title={t("context.emptyTitle")}
          body={t("context.emptyBody")}
          ctaLabel={t("context.reindex")}
          onCta={() => refetchDocs()}
        />
      ) : visibleRows.length === 0 ? (
        <DocsEmptyState kind="no-match" title={t("context.noMatchTitle")} />
      ) : (
        <div style={s.list}>
          {visibleRows.map((row) => (
            <DocRow
              key={row.path}
              row={row}
              onToggle={row.inheritedVia ? undefined : (v) => toggle(row.path, v)}
              onDetach={row.missing ? () => detach(row.path) : undefined}
              onPreview={() => setPreviewPath(row.path)}
              draggable={row.attached && !row.missing}
              onDragStart={() => setDragPath(row.path)}
              onDragOver={(e) => {
                if (dragPath) e.preventDefault();
              }}
              onDrop={() => onDrop(row.path)}
              onDragEnd={() => setDragPath(null)}
              actions={
                row.attached && !row.missing ? (
                  <>
                    <IconBtn icon="ArrowUp" label={t("context.moveUp")} onClick={() => move(row.path, -1)} />
                    <IconBtn icon="ArrowDown" label={t("context.moveDown")} onClick={() => move(row.path, 1)} />
                  </>
                ) : undefined
              }
            />
          ))}
        </div>
      )}

      {docsList && docsList.documents.length < docsList.total && (
        <p style={s.capNote}>{t("context.capped", { shown: docsList.documents.length, total: docsList.total })}</p>
      )}

      {preview && (
        <div style={s.footer}>
          <span style={overBudget ? s.footerTokensCritical : s.footerTokens}>
            {t("context.footerTokens", { count: preview.total_tokens })}
          </span>
          {overBudget && <Badge color="var(--crit)" bg="var(--crit-bg)">{t("context.footerCritical")}</Badge>}
          <p style={s.footerNote}>{t("context.footerNote")}</p>
        </div>
      )}

      {setAttached.isError && (
        <DocsEmptyState
          kind="error"
          title={t("context.saveError")}
          onCta={() => lastAttempt && setAttached.mutate(lastAttempt)}
        />
      )}

      {previewRow && (
        <DocPreviewDrawer
          repoId={repoId}
          path={previewRow.path}
          bucket={previewRow.bucket}
          attached={previewRow.attached}
          onToggleAttach={(next) => toggle(previewRow.path, next)}
          onClose={() => setPreviewPath(null)}
        />
      )}
    </div>
  );
}
