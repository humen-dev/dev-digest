/* CreateSkillFromConventionsModal — "Create skill from conventions". Everything
   is prefilled from the server draft and editable before saving: name,
   description, type, enabled and the markdown body. It only creates the skill;
   linking it to an agent is done on the agent's Skills tab. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, ErrorState, FormField, Icon, Modal, SelectInput, TextInput, Toggle } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { SkillBodyEditor } from "@/components/skill-body-editor";
import { SKILL_TYPE_OPTIONS } from "@/lib/skill-types";
import { useConventionSkillDraft, useCreateSkillFromConventions } from "@/lib/hooks/conventions";
import { CREATE_SKILL_MODAL_WIDTH } from "../../constants";
import { s } from "./styles";

export function CreateSkillFromConventionsModal({
  repoId,
  repoName,
  onClose,
}: {
  repoId: string;
  repoName: string;
  onClose: () => void;
}) {
  const t = useTranslations("conventions");
  const ts = useTranslations("skills");
  const router = useRouter();
  const { data: draft, isLoading, isError, refetch } = useConventionSkillDraft(repoId, true);
  const create = useCreateSkillFromConventions(repoId);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>("convention");
  const [enabled, setEnabled] = React.useState(true);
  const [body, setBody] = React.useState("");

  React.useEffect(() => {
    if (!draft) return;
    setName(draft.name);
    setDescription(draft.description);
    setType(draft.type);
    setEnabled(draft.enabled);
    setBody(draft.body);
  }, [draft]);

  const submit = async () => {
    if (!draft) return;
    const skill = await create.mutateAsync({
      name: name.trim(),
      description,
      type,
      enabled,
      body,
      convention_ids: draft.convention_ids,
    });
    onClose();
    router.push(`/skills/${skill.id}?tab=config`);
  };

  const canSubmit = !!draft && !!name.trim() && !!body.trim() && !create.isPending;

  return (
    <Modal
      width={CREATE_SKILL_MODAL_WIDTH}
      title={t("modal.title")}
      subtitle={name || draft?.name}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <span style={s.footerNote}>
            <Icon.Sparkles size={12} />
            {t("modal.footerNote")}
          </span>
          <Button kind="ghost" onClick={onClose}>
            {t("modal.cancel")}
          </Button>
          <Button kind="primary" icon="Sparkles" disabled={!canSubmit} onClick={() => void submit()}>
            {create.isPending ? t("modal.creating") : t("modal.create")}
          </Button>
        </div>
      }
    >
      {isError ? (
        <ErrorState body={t("modal.draftError")} onRetry={() => refetch()} />
      ) : isLoading || !draft ? (
        <div style={s.loading}>{t("modal.loading")}</div>
      ) : (
        <div style={s.body}>
          <div style={s.banner}>
            <Icon.Sparkles size={14} style={s.bannerIcon} />
            <div>
              {t.rich("modal.banner", {
                count: draft.convention_ids.length,
                repoName,
                b: (chunks) => <b>{chunks}</b>,
                repo: (chunks) => (
                  <span className="mono" style={s.bannerRepo}>
                    {chunks}
                  </span>
                ),
              })}
            </div>
          </div>

          <FormField label={t("modal.fields.name")} required>
            <TextInput value={name} onChange={setName} mono />
          </FormField>
          <FormField label={t("modal.fields.description")}>
            <TextInput value={description} onChange={setDescription} />
          </FormField>

          <div style={s.row}>
            <div style={s.typeCol}>
              <FormField label={t("modal.fields.type")}>
                <SelectInput
                  value={type}
                  onChange={(v) => setType(v as SkillType)}
                  options={SKILL_TYPE_OPTIONS.map((v) => ({ value: v, label: ts(`config.typeOptions.${v}`) }))}
                  mono
                />
              </FormField>
            </div>
            <div style={s.enabledCol}>
              <FormField label={t("modal.fields.enabled")} hint={t("modal.fields.enabledHint")}>
                <Toggle on={enabled} onChange={setEnabled} size={16} />
              </FormField>
            </div>
          </div>

          <FormField label={t("modal.fields.body")} required>
            <SkillBodyEditor
              name={name || draft.name}
              body={body}
              savedBody=""
              initialTokens={draft.body_tokens}
              onChange={setBody}
            />
          </FormField>
        </div>
      )}
    </Modal>
  );
}
