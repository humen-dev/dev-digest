/* CreateSkillFromConventionsModal — merges the accepted conventions into ONE
   skill. The server assembles the draft (body, name, evidence files); every
   field here is editable before saving. The agent link is optional: picking one
   appends the skill to that agent's order, otherwise it is linked later on
   /agents/:id → Skills tab. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, ErrorState, FormField, Modal, SelectInput, TextInput, Toggle } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { SkillBodyEditor } from "@/components/skill-body-editor";
import { SKILL_TYPE_OPTIONS } from "@/lib/skill-types";
import { useAgents } from "@/lib/hooks/agents";
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
  const router = useRouter();
  const { data: draft, isLoading, isError, refetch } = useConventionSkillDraft(repoId, true);
  const create = useCreateSkillFromConventions(repoId);
  const { data: agents } = useAgents();
  /* null = the user hasn't chosen yet, so the first agent is the default (the
     skill lands linked). "" is an explicit "don't link". */
  const [agentId, setAgentId] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>("convention");
  const [enabled, setEnabled] = React.useState(true);
  const [body, setBody] = React.useState("");

  /* The draft arrives after the modal opens — prefill once it lands, then leave
     the fields to the user. */
  React.useEffect(() => {
    if (!draft) return;
    setName(draft.name);
    setDescription(draft.description);
    setType(draft.type);
    setEnabled(draft.enabled);
    setBody(draft.body);
  }, [draft]);

  React.useEffect(() => {
    if (agentId === null && agents && agents.length > 0) setAgentId(agents[0]!.id);
  }, [agents, agentId]);

  const submit = async () => {
    if (!draft) return;
    const skill = await create.mutateAsync({
      name: name.trim(),
      description,
      type,
      enabled,
      body,
      convention_ids: draft.convention_ids,
      ...(agentId ? { agent_id: agentId } : {}),
    });
    onClose();
    router.push(`/skills/${skill.id}?tab=config`);
  };

  const canSubmit = !!draft && !!name.trim() && !!body.trim() && !create.isPending;

  return (
    <Modal
      width={CREATE_SKILL_MODAL_WIDTH}
      title={t("modal.title")}
      subtitle={<span className="mono">{name || t("modal.fields.name")}</span>}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <span style={s.footerNote}>{t("modal.footerNote")}</span>
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

          <FormField label={t("modal.fields.name")} required>
            <TextInput value={name} onChange={setName} mono />
          </FormField>
          <FormField label={t("modal.fields.description")}>
            <TextInput value={description} onChange={setDescription} />
          </FormField>
          <FormField label={t("modal.fields.type")}>
            <SelectInput
              value={type}
              onChange={(v) => setType(v as SkillType)}
              options={SKILL_TYPE_OPTIONS.map((v) => ({ value: v, label: v }))}
            />
          </FormField>
          <FormField label={t("modal.fields.enabled")}>
            <div style={s.enabledRow}>
              <Toggle on={enabled} onChange={setEnabled} label={t("modal.fields.enabled")} />
              <span style={s.enabledHint}>{t("modal.fields.enabledHint")}</span>
            </div>
          </FormField>
          <FormField label={t("modal.fields.agent")} hint={t("modal.fields.agentHint")}>
            <SelectInput
              value={agentId ?? ""}
              onChange={setAgentId}
              options={[
                { value: "", label: t("modal.fields.agentNone") },
                ...(agents ?? []).map((a) => ({ value: a.id, label: a.name })),
              ]}
            />
          </FormField>
          <FormField label={t("modal.fields.body")} required>
            <SkillBodyEditor
              name={name}
              body={body}
              savedBody={draft.body}
              initialTokens={draft.body_tokens}
              onChange={setBody}
            />
          </FormField>
        </div>
      )}
    </Modal>
  );
}
