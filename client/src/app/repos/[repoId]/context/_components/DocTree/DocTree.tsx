/* DocTree — the Project Context page's document list: a tree grouped by
   folder (AC-7) with a scan footer (AC-13), a "capped" notice when the walk
   hit the 500-document cap (EC-6), and the "no project documents" empty
   state (EC-9). Selection and refresh are owned by the parent. */
"use client";

import { Button, EmptyState, Icon } from "@devdigest/ui";
import { useTranslations } from "next-intl";
import type { ProjectDocument } from "@devdigest/shared";
import { relativeTime } from "@/lib/relative-time";
import { fileLabel, groupDocsByFolder, ROOT_BUCKET } from "./helpers";
import { s } from "./styles";

export function DocTree({
  documents,
  total,
  scannedAt,
  selectedPath,
  onSelect,
  onRefresh,
}: {
  documents: ProjectDocument[];
  total: number;
  scannedAt: string;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onRefresh: () => void;
}) {
  const t = useTranslations("projectContext");

  if (documents.length === 0) {
    return (
      <EmptyState
        icon="FileText"
        title={t("tree.empty.title")}
        body={t("tree.empty.body")}
        cta={t("tree.empty.cta")}
        onCta={onRefresh}
      />
    );
  }

  const folders = groupDocsByFolder(documents);
  const capped = documents.length < total;

  return (
    <div style={s.wrap}>
      {capped && <div style={s.capped}>{t("tree.capped", { shown: documents.length, total })}</div>}
      <div style={s.list}>
        {folders.map((folder) => (
          <div key={folder.bucket}>
            {folder.bucket !== ROOT_BUCKET && (
              <div style={s.folder}>
                <Icon.Folder size={13} style={{ color: "var(--text-muted)" }} />
                <span style={s.folderLabel}>{folder.bucket}</span>
              </div>
            )}
            {folder.docs.map((doc) => (
              <button
                key={doc.path}
                type="button"
                title={doc.path}
                aria-current={selectedPath === doc.path ? "true" : undefined}
                style={s.fileBtn(selectedPath === doc.path)}
                onClick={() => onSelect(doc.path)}
              >
                <Icon.File size={13} />
                <span style={s.fileName}>{fileLabel(doc.path)}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
      <div style={s.footer}>
        <span>{t("tree.footer", { count: total, when: relativeTime(scannedAt) })}</span>
        <Button kind="ghost" size="sm" icon="RefreshCw" onClick={onRefresh}>
          {t("tree.refresh")}
        </Button>
      </div>
    </div>
  );
}
