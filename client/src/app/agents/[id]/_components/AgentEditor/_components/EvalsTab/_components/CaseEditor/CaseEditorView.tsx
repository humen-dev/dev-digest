"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { EvalCaseDetail } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { CaseModal } from "@/components/eval/CaseModal";
import { caseReasonKey } from "@/lib/eval-format";
import { useDeleteEvalCase } from "@/lib/hooks/eval";
import { caseErrorKey, caseErrorValues } from "../../helpers";
import { s } from "./styles";

/** Editor for one stored case: the shared case modal in `saved` mode, with delete in the footer
 *  and the source link / last outcome below the form. */
export function CaseEditorView({
  agentId,
  detail,
  onClose,
}: {
  agentId: string;
  detail: EvalCaseDetail;
  onClose: () => void;
}) {
  const t = useTranslations("eval");
  const tc = useTranslations("common");
  const remove = useDeleteEvalCase(agentId);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const outcome = detail.last_outcome?.outcome ?? null;
  const reasonKey = caseReasonKey(outcome?.error_reason);
  const apiErr = remove.error instanceof ApiError ? remove.error : null;

  function confirmDelete() {
    remove.mutate(detail.id, { onSuccess: onClose });
  }

  const footerExtra = (
    <div style={s.footer}>
      {remove.error != null && (
        <span role="alert" style={s.error}>
          {t(`errors.${caseErrorKey(apiErr?.code)}`, caseErrorValues(apiErr?.details))}
        </span>
      )}
      {confirmingDelete ? (
        <>
          <span style={s.confirm}>{t("caseEditor.deleteConfirm")}</span>
          <Button kind="danger" onClick={confirmDelete} disabled={remove.isPending}>
            {t("evalsTab.delete")}
          </Button>
          <Button kind="ghost" onClick={() => setConfirmingDelete(false)}>
            {tc("actions.cancel")}
          </Button>
        </>
      ) : (
        <Button kind="ghost" icon="Trash" onClick={() => setConfirmingDelete(true)} disabled={remove.isPending}>
          {t("evalsTab.delete")}
        </Button>
      )}
    </div>
  );

  const bodyExtra = (
    <div style={s.section}>
      {detail.source ? (
        <Link href={`/repos/${detail.source.repo_id}/pulls/${detail.source.pr_number}`} style={s.link}>
          {t("caseEditor.sourceLink")} · #{detail.source.pr_number}
        </Link>
      ) : detail.source_deleted ? (
        <span style={s.muted}>{t("caseEditor.sourceDeleted")}</span>
      ) : null}

      {outcome && (
        <div>
          <h3 style={s.h3}>
            {t("caseEditor.lastOutcome")} ·{" "}
            {t(`status.${outcome.status === "errored" ? "errored" : outcome.pass ? "pass" : "fail"}`)}
          </h3>
          {outcome.error_reason && <p style={s.muted}>{reasonKey ? t(reasonKey) : outcome.error_reason}</p>}
          <ul style={s.actual}>
            {outcome.actual.map((a, i) => (
              <li key={`${a.file}:${a.start_line}:${i}`} style={s.actualItem}>
                <div>
                  <strong>{a.title}</strong> <span style={s.muted}>{a.severity} · {a.category}</span>
                </div>
                <div className="mono" style={s.muted}>
                  {a.file}:{a.start_line}–{a.end_line}
                </div>
                <div>{a.rationale}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  return (
    <CaseModal
      mode="saved"
      agentId={agentId}
      detail={detail}
      onSaved={onClose}
      onClose={onClose}
      footerExtra={footerExtra}
      bodyExtra={bodyExtra}
    />
  );
}
