"use client";

import { useTranslations } from "next-intl";
import { Badge, Skeleton } from "@devdigest/ui";
import type { CiFile, CiPreview } from "@devdigest/shared";
import { errorMessage, formatBytes } from "../../helpers";
import { s } from "../../styles";

function FileBody({ file, draft, onDraft }: { file: CiFile; draft: string | null; onDraft: (v: string) => void }) {
  if (file.kind === "runner" || file.contents === null) return null;
  if (file.editable) {
    return (
      <textarea
        aria-label={file.path}
        style={s.editor}
        spellCheck={false}
        value={draft ?? file.contents}
        onChange={(e) => onDraft(e.target.value)}
      />
    );
  }
  return <pre style={s.filePre}>{file.contents}</pre>;
}

/**
 * Step 2 — every generated file. The workflow is an editable textarea (AC-12), the others are
 * read-only, and the runner shows size + hash only (AC-13). Violations block Continue
 * (the wizard reads them too); warnings are informational.
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

  return (
    <div style={s.fieldGroup}>
      <span style={s.label}>{t("filesToCreate")}</span>
      <div style={s.fileList}>
        {preview.files.map((f) => (
          <div key={f.path} style={s.fileCard}>
            <div style={s.fileHead}>
              <span style={s.fileHeadPath}>{f.path}</span>
              {f.kind === "runner" && (
                <span style={s.hint}>{t("runnerMeta", { size: formatBytes(f.bytes), hash: f.sha256 })}</span>
              )}
              <Badge>{f.editable ? t("editable") : t("readOnly")}</Badge>
            </div>
            <FileBody file={f} draft={draft} onDraft={onDraft} />
          </div>
        ))}
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
