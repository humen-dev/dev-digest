"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Modal, ErrorState, Skeleton } from "@devdigest/ui";
import { useEvalCase } from "@/lib/hooks/eval";
import { EDITOR_WIDTH } from "../../constants";
import { useDialogKeyboard } from "../../hooks/useDialogKeyboard";
import { CaseEditorView } from "./CaseEditorView";

/** Dialog for one stored case: loads it, then hands it to the form view. */
export function CaseEditor({ agentId, caseId, onClose }: { agentId: string; caseId: string; onClose: () => void }) {
  const { data, isError, refetch } = useEvalCase(caseId);

  if (data) return <CaseEditorView key={data.id} agentId={agentId} detail={data} onClose={onClose} />;
  return <CaseEditorLoading isError={isError} onRetry={() => refetch()} onClose={onClose} />;
}

function CaseEditorLoading({ isError, onRetry, onClose }: { isError: boolean; onRetry: () => void; onClose: () => void }) {
  const t = useTranslations("eval");
  const tc = useTranslations("common");
  const bodyRef = useDialogKeyboard(onClose);

  return (
    <Modal width={EDITOR_WIDTH} title={tc("states.loading")} onClose={onClose}>
      <div ref={bodyRef} style={{ padding: 24 }}>
        {isError ? <ErrorState title={t("errors.generic")} onRetry={onRetry} /> : <Skeleton height={160} />}
      </div>
    </Modal>
  );
}
