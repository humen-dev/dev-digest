/* ImportTab — file or URL → preview → confirm. Nothing is written to the DB
   until the user confirms: the preview endpoints only ever read the upload /
   the fetched file and return a draft + the entries they deliberately did NOT
   process (scripts, binaries, nested .md). Confirming is a plain `POST /skills`
   with `source: 'imported_file' | 'imported_url'` — the body is trusted-ish
   prompt text, so the full body is shown here before it can be saved (see
   reviewer-core's `wrapUntrusted` note: an imported skill's body is NOT wrapped
   as untrusted at prompt-assembly time, so this preview is the one deliberate
   checkpoint). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, TextInput, SelectInput, Icon } from "@devdigest/ui";
import type { SkillImportPreview, SkillType } from "@devdigest/shared";
import { useCreateSkill, useImportSkillPreview, useImportUrlPreview } from "../../../../../../lib/hooks/skills";
import { ApiError } from "../../../../../../lib/api";
import { useToast } from "../../../../../../lib/toast";
import { SKILL_TYPE_OPTIONS } from "@/lib/skill-types";
import { fileToBase64 } from "./helpers";
import { s } from "./styles";


export function ImportTab({
  mode,
  onClose,
  onImported,
}: {
  mode: "file" | "url";
  onClose: () => void;
  onImported: (skillId: string) => void;
}) {
  const t = useTranslations("skills");
  const toast = useToast();
  const filePreview = useImportSkillPreview();
  const urlPreview = useImportUrlPreview();
  const preview = mode === "file" ? filePreview : urlPreview;
  const create = useCreateSkill();

  const [fileName, setFileName] = React.useState<string | null>(null);
  const [url, setUrl] = React.useState("");
  const [result, setResult] = React.useState<SkillImportPreview | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Editable draft fields — the parsed name/type are a best-effort guess
  // (frontmatter or first heading); let the user fix them before saving.
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>("custom");

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setFileName(file.name);
    await runPreview(async () =>
      filePreview.mutateAsync({ filename: file.name, content_base64: await fileToBase64(file) }),
    );
  };

  const fetchUrl = () => runPreview(() => urlPreview.mutateAsync({ url: url.trim() }));

  const runPreview = async (run: () => Promise<SkillImportPreview>) => {
    setResult(null);
    setError(null);
    try {
      const p = await run();
      setResult(p);
      setName(p.draft.name);
      setDescription(p.draft.description);
      setType(p.draft.type);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("drawer.importFailed"));
    }
  };

  const confirm = async () => {
    if (!result) return;
    const skill = await create.mutateAsync({
      name,
      description,
      type,
      body: result.draft.body,
      source: mode === "file" ? "imported_file" : "imported_url",
    });
    toast.success(t("drawer.importedToast", { name: skill.name }));
    onImported(skill.id);
  };

  return (
    <>
      <div style={s.content}>
        {mode === "file" ? (
          <label style={s.fileRow}>
            <Icon.Upload size={16} style={{ color: "var(--text-muted)" }} />
            <span style={s.fileName}>{fileName ?? t("drawer.chooseFile")}</span>
            <input
              type="file"
              accept=".md,.zip"
              onChange={handleFile}
              style={{ display: "none" }}
              aria-label={t("drawer.chooseFile")}
            />
          </label>
        ) : (
          <FormField label={t("url.label")} hint={t("url.hint")}>
            <div style={s.urlRow}>
              <div style={{ flex: 1 }}>
                <TextInput value={url} onChange={setUrl} placeholder={t("url.placeholder")} mono />
              </div>
              <Button kind="secondary" disabled={!url.trim() || preview.isPending} onClick={() => void fetchUrl()}>
                {t("url.fetch")}
              </Button>
            </div>
          </FormField>
        )}

      {preview.isPending && <div style={s.status}>{t("drawer.previewing")}</div>}
      {error && <div style={s.error}>{error}</div>}

      {result && (
        <div style={s.previewWrap}>
          <div style={s.previewTitle}>{t("drawer.previewTitle")}</div>
          <FormField label={t("drawer.nameLabel")}>
            <TextInput value={name} onChange={setName} mono />
          </FormField>
          <FormField label={t("drawer.descriptionLabel")}>
            <TextInput value={description} onChange={setDescription} />
          </FormField>
          <FormField label={t("drawer.typeLabel")}>
            <SelectInput
              value={type}
              onChange={(v) => setType(v as SkillType)}
              options={SKILL_TYPE_OPTIONS.map((v) => ({ value: v, label: t(`config.typeOptions.${v}`) }))}
            />
          </FormField>
          <FormField label={t("file.bodyLabel")}>
            <pre className="mono" style={s.bodyPre}>
              {result.draft.body}
            </pre>
          </FormField>

          {result.ignored_entries.length > 0 && (
            <div style={s.listCard}>
              <div style={s.listTitle}>{t("drawer.ignoredEntries")}</div>
              {result.ignored_entries.map((entry, i) => (
                <div key={i} className="mono" style={s.listItem}>
                  {entry}
                </div>
              ))}
            </div>
          )}

          {result.warnings.length > 0 && (
            <div style={s.listCard}>
              <div style={s.listTitle}>{t("drawer.warnings")}</div>
              {result.warnings.map((w, i) => (
                <div key={i} style={s.listItem}>
                  {w}
                </div>
              ))}
            </div>
          )}

          <div style={s.untrustedNotice}>
            <Icon.AlertTriangle size={15} />
            <span>{t("drawer.untrustedNotice")}</span>
          </div>
        </div>
      )}
      </div>
      <div style={s.footer}>
        <Button kind="ghost" onClick={onClose}>
          {t("drawer.cancel")}
        </Button>
        <Button kind="primary" icon="Upload" onClick={confirm} disabled={!result || create.isPending}>
          {create.isPending ? t("drawer.confirming") : t("drawer.confirm")}
        </Button>
      </div>
    </>
  );
}
