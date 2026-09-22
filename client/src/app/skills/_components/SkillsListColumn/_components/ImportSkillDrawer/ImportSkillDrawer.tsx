/* ImportSkillDrawer — file → preview → confirm. Nothing is written to the DB
   until the user confirms: `POST /skills/import/preview` only ever reads the
   upload and returns a draft + the entries it deliberately did NOT process
   (scripts, binaries, nested .md). Confirming is a plain `POST /skills` with
   `source: 'imported_file'` — the body is trusted-ish prompt text, so the full
   body is shown here before it can be saved (see reviewer-core's `wrapUntrusted`
   note: an imported skill's body is NOT wrapped as untrusted at prompt-assembly
   time, so this preview is the one deliberate checkpoint). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Drawer, Button, FormField, TextInput, SelectInput, Icon } from "@devdigest/ui";
import type { SkillImportPreview, SkillType } from "@devdigest/shared";
import { useCreateSkill, useImportSkillPreview } from "../../../../../../lib/hooks/skills";
import { ApiError } from "../../../../../../lib/api";
import { useToast } from "../../../../../../lib/toast";
import { fileToBase64 } from "./helpers";
import { s } from "./styles";

const TYPE_OPTIONS: SkillType[] = ["rubric", "convention", "security", "custom"];

export function ImportSkillDrawer({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (skillId: string) => void;
}) {
  const t = useTranslations("skills");
  const toast = useToast();
  const preview = useImportSkillPreview();
  const create = useCreateSkill();

  const [fileName, setFileName] = React.useState<string | null>(null);
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
    setResult(null);
    setError(null);
    try {
      const content_base64 = await fileToBase64(file);
      const p = await preview.mutateAsync({ filename: file.name, content_base64 });
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
      source: "imported_file",
    });
    toast.success(t("drawer.importedToast", { name: skill.name }));
    onImported(skill.id);
  };

  return (
    <Drawer
      title={t("drawer.title")}
      subtitle={t("drawer.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("drawer.cancel")}
          </Button>
          <Button kind="primary" icon="Upload" onClick={confirm} disabled={!result || create.isPending}>
            {create.isPending ? t("drawer.confirming") : t("drawer.confirm")}
          </Button>
        </div>
      }
    >
      <label style={s.fileRow}>
        <Icon.Upload size={16} style={{ color: "var(--text-muted)" }} />
        <span style={s.fileName}>{fileName ?? t("drawer.chooseFile")}</span>
        <input type="file" accept=".md,.zip" onChange={handleFile} style={{ display: "none" }} aria-label={t("drawer.chooseFile")} />
      </label>

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
              options={TYPE_OPTIONS.map((v) => ({ value: v, label: t(`config.typeOptions.${v}`) }))}
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
    </Drawer>
  );
}
