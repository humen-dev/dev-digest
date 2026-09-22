"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, TextInput, SelectInput, Toggle, Button } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useUpdateSkill } from "../../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../../lib/toast";
import { SkillBodyEditor } from "./_components/SkillBodyEditor";
import { TYPE_OPTIONS } from "./constants";
import { s } from "./styles";

/** Config tab — name/description/type/enabled + the SkillBodyEditor + Save.
    One PUT covers all of it; the server only bumps `version` when `body`
    actually changed (name/description/type/enabled do not). */
export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const update = useUpdateSkill();
  const [name, setName] = React.useState(skill.name);
  const [description, setDescription] = React.useState(skill.description);
  const [type, setType] = React.useState<SkillType>(skill.type);
  const [enabled, setEnabled] = React.useState(skill.enabled);
  const [body, setBody] = React.useState(skill.body);

  // Reset local form when switching skills.
  React.useEffect(() => {
    setName(skill.name);
    setDescription(skill.description);
    setType(skill.type);
    setEnabled(skill.enabled);
    setBody(skill.body);
  }, [skill.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const typeOptions = TYPE_OPTIONS.map((v) => ({ value: v, label: t(`config.typeOptions.${v}`) }));

  const save = () =>
    update.mutate(
      { id: skill.id, patch: { name, description, type, enabled, body } },
      { onSuccess: (data) => toast.success(t("config.savedToast", { version: data.version })) },
    );

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
      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={update.isPending}>
          {update.isPending ? t("config.saving") : t("config.save")}
        </Button>
        {update.isSuccess && (
          <span style={s.savedNote}>{t("config.saved", { version: update.data?.version })}</span>
        )}
      </div>
    </div>
  );
}
