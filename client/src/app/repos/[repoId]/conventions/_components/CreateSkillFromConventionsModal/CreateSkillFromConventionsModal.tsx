/* CreateSkillFromConventionsModal — the compact confirm step from the
   conventions board: a banner, the assembled name and description, then
   Cancel / Create. The body, type and enabled flag stay the server draft
   (edited later on the skill). The new skill is appended to the first agent. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, ErrorState, FormField, Icon, Modal, TextInput } from "@devdigest/ui";
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
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");

  React.useEffect(() => {
    if (!draft) return;
    setName(draft.name);
    setDescription(draft.description);
  }, [draft]);

  const submit = async () => {
    if (!draft) return;
    const agentId = agents?.[0]?.id;
    const skill = await create.mutateAsync({
      name: name.trim(),
      description,
      type: draft.type,
      enabled: draft.enabled,
      body: draft.body,
      convention_ids: draft.convention_ids,
      ...(agentId ? { agent_id: agentId } : {}),
    });
    onClose();
    router.push(`/skills/${skill.id}?tab=config`);
  };

  const canSubmit = !!draft && !!name.trim() && !create.isPending;

  return (
    <Modal
      width={CREATE_SKILL_MODAL_WIDTH}
      title={t("modal.title")}
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
        </div>
      )}
    </Modal>
  );
}
