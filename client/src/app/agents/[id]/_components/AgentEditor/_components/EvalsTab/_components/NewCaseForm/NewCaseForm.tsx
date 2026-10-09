"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { useCreateEvalCase } from "@/lib/hooks/eval";
import { EDITOR_WIDTH } from "../../constants";
import { EMPTY_DRAFT, caseErrorKey, caseErrorValues, draftToInput, isDraftValid } from "../../helpers";
import type { CaseDraft } from "../../types";
import { CaseFormFields } from "../CaseFormFields";
import { s } from "./styles";

/** Manual creation of an eval case (AC-49): POST /agents/:id/eval-cases. */
export function NewCaseForm({ agentId, onClose }: { agentId: string; onClose: () => void }) {
  const t = useTranslations("eval");
  const tc = useTranslations("common");
  const create = useCreateEvalCase(agentId);
  const [draft, setDraft] = useState<CaseDraft>(EMPTY_DRAFT);
  const err = create.error;
  const apiErr = err instanceof ApiError ? err : null;

  function submit() {
    const input = draftToInput(draft);
    if (!input) return;
    create.mutate(input, { onSuccess: onClose });
  }

  return (
    <Modal
      width={EDITOR_WIDTH}
      title={t("caseEditor.newCase")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          {err && (
            <span role="alert" style={s.error}>
              {t(`errors.${caseErrorKey(apiErr?.code)}`, caseErrorValues(apiErr?.details, draft))}
            </span>
          )}
          <Button kind="ghost" onClick={onClose}>
            {tc("actions.cancel")}
          </Button>
          <Button kind="primary" onClick={submit} disabled={!isDraftValid(draft) || create.isPending}>
            {create.isPending ? t("caseEditor.saving") : t("caseEditor.save")}
          </Button>
        </div>
      }
    >
      <CaseFormFields draft={draft} onChange={(p) => setDraft((d) => ({ ...d, ...p }))} />
    </Modal>
  );
}
