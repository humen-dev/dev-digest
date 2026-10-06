/* ContextTab (skill) — every repo project doc, with a checkbox that attaches
   it to this skill. There is no server-side effective-context preview for a
   skill (3.2 lists none — only `GET /agents/:id/context-preview`), so: order
   is reorderable with ArrowUp/ArrowDown on a focused row (no visible
   Move buttons, unlike the agent tab) plus the same native drag-and-drop
   (D7); "missing" is inferred client-side from a doc's absence in the
   current working-tree scan; and the "Serializes as" preview groups the
   skill's own attached docs by bucket (specs, docs, insights, others A→Z,
   root last) to show how `renderProjectContext` would present them once an
   agent links this skill. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useActiveRepo } from "@/lib/repo-context";
import { useProjectDocs, useSetSkillContextDocs, useSkillContextDocs } from "@/lib/hooks/project-context";
import { DocFilter } from "@/components/context-docs/DocFilter";
import { DocPreviewDrawer } from "@/components/context-docs/DocPreviewDrawer";
import { DocRow } from "@/components/context-docs/DocRow";
import { DocsEmptyState } from "@/components/context-docs/DocsEmptyState";
import { bucketHeading, buildSkillContextRows, groupByBucket, matchesFilter, moveAttached, reorderAttached } from "@/components/context-docs/helpers";
import { s } from "./styles";

export function ContextTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { repoId } = useActiveRepo();
  const { data: docsList, isLoading: docsLoading, isError: docsError, refetch: refetchDocs } = useProjectDocs(repoId);
  const { data: attached, isLoading: attachedLoading } = useSkillContextDocs(skill.id);
  const setAttached = useSetSkillContextDocs(skill.id);

  const [filter, setFilter] = React.useState("");
  const [dragPath, setDragPath] = React.useState<string | null>(null);
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);
  const [lastAttempt, setLastAttempt] = React.useState<string[] | null>(null);

  const attachedPaths = attached?.paths ?? [];
  const docs = docsList?.documents ?? [];
  const rows = React.useMemo(() => buildSkillContextRows(docs, attachedPaths), [docs, attachedPaths]);
  const visibleRows = rows.filter((r) => matchesFilter(r, filter));
  const serializeGroups = React.useMemo(
    () => groupByBucket(rows.filter((r) => r.attached && !r.missing)),
    [rows],
  );

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

  const handleKeyDown = (path: string) => (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      move(path, -1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      move(path, 1);
    }
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

  return (
    <div style={s.wrap}>
      <div style={s.headerRow}>
        <h2 style={s.h2}>{t("context.title")}</h2>
        <Badge color="var(--text-secondary)">{t("context.attachedBadge", { count: attachedPaths.length })}</Badge>
      </div>
      <p style={s.hint}>{t("context.inheritNote")}</p>

      <DocFilter value={filter} onChange={setFilter} placeholder={t("context.filterPlaceholder")} />

      {visibleRows.length === 0 ? (
        <DocsEmptyState
          kind={filter.trim() ? "no-match" : "empty"}
          icon="FileText"
          title={filter.trim() ? t("context.noMatchTitle") : t("context.emptyTitle")}
          ctaLabel={filter.trim() ? t("context.attachCta") : undefined}
          onCta={filter.trim() ? () => setFilter("") : undefined}
        />
      ) : (
        <div style={s.list}>
          {visibleRows.map((row) => (
            <DocRow
              key={row.path}
              row={row}
              onToggle={(v) => toggle(row.path, v)}
              onDetach={row.missing ? () => detach(row.path) : undefined}
              onPreview={() => setPreviewPath(row.path)}
              draggable={row.attached && !row.missing}
              onDragStart={() => setDragPath(row.path)}
              onDragOver={(e) => {
                if (dragPath) e.preventDefault();
              }}
              onDrop={() => onDrop(row.path)}
              onDragEnd={() => setDragPath(null)}
              onKeyDown={row.attached && !row.missing ? handleKeyDown(row.path) : undefined}
            />
          ))}
        </div>
      )}

      {docsList && docsList.documents.length < docsList.total && (
        <p style={s.capNote}>{t("context.capped", { shown: docsList.documents.length, total: docsList.total })}</p>
      )}

      {setAttached.isError && (
        <DocsEmptyState
          kind="error"
          title={t("context.saveError")}
          onCta={() => lastAttempt && setAttached.mutate(lastAttempt)}
        />
      )}

      <div style={s.serializeCard}>
        <div style={s.serializeTitle}>{t("context.serializeTitle")}</div>
        {serializeGroups.length === 0 ? (
          <p style={s.empty}>{t("context.serializeEmpty")}</p>
        ) : (
          serializeGroups.map((group) => (
            <div key={group.bucket}>
              <div style={s.bucketHeading}>{bucketHeading(group.bucket)}</div>
              <ul style={s.bucketList}>
                {group.docs.map((d) => (
                  <li key={d.path}>{d.path}</li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>

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
