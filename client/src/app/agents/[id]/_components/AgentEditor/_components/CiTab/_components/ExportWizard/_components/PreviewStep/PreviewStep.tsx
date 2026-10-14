"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Skeleton } from "@devdigest/ui";
import type { CiFile, CiPreview } from "@devdigest/shared";
import { defaultPreviewPath, errorMessage, formatBytes } from "../../helpers";
import { s } from "../../styles";

/** Right pane body: workflow → editable textarea (AC-12), runner → size + hash only (AC-13), others read-only. */
function FileBody({ file, draft, onDraft }: { file: CiFile; draft: string | null; onDraft: (v: string) => void }) {
  const t = useTranslations("ci.exportWizard");
  if (file.kind === "runner" || file.contents === null) {
    return (
      <div style={s.viewerMeta}>{t("runnerMeta", { size: formatBytes(file.bytes), hash: file.sha256 })}</div>
    );
  }
  if (file.editable) {
    return (
      <textarea
        aria-label={file.path}
        style={s.viewerEditor}
        spellCheck={false}
        value={draft ?? file.contents}
        onChange={(e) => onDraft(e.target.value)}
      />
    );
  }
  return <pre style={s.viewerPre}>{file.contents}</pre>;
}

/**
 * Step 2 — every generated file in a two-pane viewer: the file list on the left, the selected
 * file on the right (the workflow is selected first). Violations block Continue (the wizard
 * reads them too); warnings are informational.
 */
export function PreviewStep({
  preview,
  error,
  draft,
  onDraft,
}: {
  preview: CiPreview | undefined;
  error: unknown;
  draft: string | null;
  onDraft: (v: string) => void;
}) {
  const t = useTranslations("ci.exportWizard");
  const [selectedPath, setSelectedPath] = React.useState<string | null>(null);

  if (!preview) {
    if (error) {
      return (
        <div role="alert" style={s.error}>
          {t("exportError", { message: errorMessage(error) })}
        </div>
      );
    }
    return (
      <div aria-busy="true" aria-label={t("generating")} style={s.fileList}>
        <Skeleton height={48} />
        <Skeleton height={48} />
      </div>
    );
  }

  const selected =
    preview.files.find((f) => f.path === selectedPath) ??
    preview.files.find((f) => f.path === defaultPreviewPath(preview.files)) ??
    preview.files[0];

  return (
    <div style={s.fieldGroup}>
      <div style={s.previewPanes}>
        <div style={s.previewList}>
          <span id="ci-files-label" style={s.previewListTitle}>
            {t("filesToCreate")}
          </span>
          <div role="listbox" aria-labelledby="ci-files-label">
            {preview.files.map((f) => {
              const active = f.path === selected?.path;
              return (
                <button
                  key={f.path}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => setSelectedPath(f.path)}
                  style={s.previewItem(active)}
                >
                  <Icon.FileText size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span style={s.previewItemPath}>{f.path}</span>
                </button>
              );
            })}
          </div>
        </div>

        {selected && (
          <div style={s.viewer}>
            <div style={s.viewerHead}>
              <span style={s.viewerPath}>{selected.path}</span>
              <span style={s.viewerBadge}>
                {selected.editable && <Icon.Edit size={12} />}
                {selected.editable ? t("editable") : t("readOnly")}
              </span>
            </div>
            <FileBody key={selected.path} file={selected} draft={draft} onDraft={onDraft} />
          </div>
        )}
      </div>

      {error ? (
        <div role="alert" style={s.error}>
          {t("exportError", { message: errorMessage(error) })}
        </div>
      ) : null}

      {preview.workflow_violations.length > 0 && (
        <div role="alert" style={s.fieldGroup}>
          <span style={s.error}>{t("violationsTitle")}</span>
          <ul style={s.list}>
            {preview.workflow_violations.map((v) => (
              <li key={v.code} style={s.error}>
                {t(`violations.${v.code}`)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {preview.workflow_warnings.length > 0 && (
        <ul style={s.list}>
          {preview.workflow_warnings.map((w) => (
            <li key={w.ref} style={s.warning}>
              {t("unpinned", { ref: w.ref })}
            </li>
          ))}
        </ul>
      )}

      {preview.warnings.length > 0 && (
        <div style={s.fieldGroup}>
          <span style={s.label}>{t("skippedSkills")}</span>
          <ul style={s.list}>
            {preview.warnings.map((w) => (
              <li key={w} style={s.warning}>
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
