"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FormField, TextInput, SelectInput, Toggle, Button } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useDeleteSkill, useUpdateSkill } from "../../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../../lib/toast";
import { SkillBodyEditor } from "./_components/SkillBodyEditor";
import { TYPE_OPTIONS } from "./constants";
import { s } from "./styles";

/** Config tab — name/description/type/enabled + the SkillBodyEditor + Save,
    the optional version message, and the delete danger zone.
    One PUT covers the fields; the server only bumps `version` when `body`
    actually changed (name/description/type/enabled do not), which is also why
    the version message only rides along on a body change — there would be no
    new snapshot to attach it to otherwise. */
export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const router = useRouter();
  const update = useUpdateSkill();
  const del = useDeleteSkill();
  const [name, setName] = React.useState(skill.name);
  const [description, setDescription] = React.useState(skill.description);
  const [type, setType] = React.useState<SkillType>(skill.type);
  const [enabled, setEnabled] = React.useState(skill.enabled);
  const [body, setBody] = React.useState(skill.body);
  const [versionMessage, setVersionMessage] = React.useState("");

  const reset = React.useCallback(() => {
    setName(skill.name);
    setDescription(skill.description);
    setType(skill.type);
    setEnabled(skill.enabled);
    setBody(skill.body);
    setVersionMessage("");
  }, [skill]);

  // Reset local form when switching skills.
  React.useEffect(() => {
    reset();
  }, [skill.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const typeOptions = TYPE_OPTIONS.map((v) => ({ value: v, label: t(`config.typeOptions.${v}`) }));

  const bodyChanged = body !== skill.body;
  const dirty =
    bodyChanged ||
    name !== skill.name ||
    description !== skill.description ||
    type !== skill.type ||
    enabled !== skill.enabled ||
    versionMessage !== "";

  const save = () =>
    update.mutate(
      {
        id: skill.id,
        patch: {
          name,
          description,
          type,
          enabled,
          body,
          ...(bodyChanged ? { version_message: versionMessage } : {}),
        },
      },
      {
        onSuccess: (data) => {
          setVersionMessage("");
          toast.success(t("config.savedToast", { version: data.version }));
        },
      },
    );

  const remove = () => {
    if (!window.confirm(t("listItem.deleteConfirm", { name: skill.name }))) return;
    del.mutate(skill.id, { onSuccess: () => router.replace("/skills") });
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("config.title")}</h2>
        <label style={s.enabledLabel}>
          {t("config.enabled")}
          <Toggle on={enabled} onChange={setEnabled} size={16} />
        </label>
      </div>
      <FormField label={t("config.name")} required>
        <TextInput value={name} onChange={setName} mono />
      </FormField>
      <FormField label={t("config.description")} hint={t("config.descriptionHint")}>
        <TextInput value={description} onChange={setDescription} />
      </FormField>
      <FormField label={t("config.type")}>
        <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
      </FormField>
      <SkillBodyEditor
        name={name || skill.name}
        body={body}
        savedBody={skill.body}
        initialTokens={skill.body_tokens}
        onChange={setBody}
      />
      <div style={s.bodyHint}>{t("config.bodyHint")}</div>
      <FormField label={t("config.versionMessage")} hint={t("config.versionMessageHint")}>
        <TextInput
          value={versionMessage}
          onChange={setVersionMessage}
          placeholder={t("config.versionMessagePlaceholder")}
        />
      </FormField>
      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={update.isPending}>
          {update.isPending ? t("config.saving") : t("config.save")}
        </Button>
        <Button kind="secondary" onClick={reset} disabled={!dirty || update.isPending}>
          {t("config.cancel")}
        </Button>
        {update.isSuccess && !dirty && (
          <span style={s.savedNote}>{t("config.saved", { version: update.data?.version })}</span>
        )}
        {/* Only shown when a body change means a snapshot will actually be taken. */}
        {bodyChanged && (
          <span style={s.nextVersionNote}>
            {t("config.snapshotAs")} <span style={s.nextVersion}>v{skill.version + 1}</span>
          </span>
        )}
      </div>
      <div style={s.dangerZone}>
        <div style={s.dangerText}>
          <div style={s.dangerTitle}>{t("config.danger.title")}</div>
          <div style={s.dangerBody}>{t("config.danger.body")}</div>
        </div>
        <Button kind="danger" icon="Trash" onClick={remove} disabled={del.isPending}>
          {del.isPending ? t("config.danger.deleting") : t("config.danger.delete")}
        </Button>
      </div>
    </div>
  );
}
