/* CreateTab — "Add skill → Create". The skill is written only when the form is
   submitted, so an abandoned modal leaves nothing behind. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, SelectInput, TextInput } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { SkillBodyEditor } from "@/components/skill-body-editor";
import { useCreateSkill } from "@/lib/hooks/skills";
import { SKILL_TYPE_OPTIONS } from "@/lib/skill-types";
import { DEFAULT_SKILL_TYPE } from "../../constants";
import { s } from "./styles";

export function CreateTab({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const t = useTranslations("skills");
  const create = useCreateSkill();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>(DEFAULT_SKILL_TYPE);
  const [body, setBody] = React.useState("");

  const submit = async () => {
    const skill = await create.mutateAsync({
      name: name.trim(),
      description,
      type,
      body,
      source: "manual",
    });
    onCreated(skill.id);
  };

  const canSubmit = !!name.trim() && !!body.trim() && !create.isPending;

  return (
    <>
      <div style={s.body}>
        <FormField label={t("createModal.name")} required>
          <TextInput value={name} onChange={setName} placeholder={t("createModal.namePlaceholder")} mono />
        </FormField>
        <FormField label={t("createModal.description")}>
          <TextInput
            value={description}
            onChange={setDescription}
            placeholder={t("createModal.descriptionPlaceholder")}
          />
        </FormField>
        <FormField label={t("createModal.type")}>
          <SelectInput
            value={type}
            onChange={(v) => setType(v as SkillType)}
            options={SKILL_TYPE_OPTIONS.map((v) => ({ value: v, label: t(`config.typeOptions.${v}`) }))}
          />
        </FormField>
        <FormField label={t("createModal.body")} required>
          <SkillBodyEditor name={name} body={body} savedBody="" initialTokens={0} onChange={setBody} />
        </FormField>
      </div>
      <div style={s.footer}>
        <span style={s.footerNote}>{t("createModal.footerNote")}</span>
        <Button kind="ghost" onClick={onClose}>
          {t("createModal.cancel")}
        </Button>
        <Button kind="primary" icon="Plus" disabled={!canSubmit} onClick={() => void submit()}>
          {create.isPending ? t("createModal.creating") : t("createModal.create")}
        </Button>
      </div>
    </>
  );
}
