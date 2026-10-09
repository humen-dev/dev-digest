"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import type { EvalCaseDetail } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useDeleteEvalCase, useUpdateEvalCase } from "@/lib/hooks/eval";
import { EDITOR_WIDTH } from "../../constants";
import { caseErrorKey, caseErrorValues, draftFromCase, draftToPatch, isDraftValid } from "../../helpers";
import { useDialogKeyboard } from "../../hooks/useDialogKeyboard";
import type { CaseDraft } from "../../types";
import { CaseFormFields } from "../CaseFormFields";
import { s } from "./styles";

/** Editor body: expectation banner, editable form, last outcome, source link, save / delete. */
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
  const update = useUpdateEvalCase();
  const remove = useDeleteEvalCase(agentId);
  const bodyRef = useDialogKeyboard(onClose);
  const [draft, setDraft] = useState<CaseDraft>(() => draftFromCase(detail));
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const stored = detail.expectation;
  const range = { file: stored.file, start: stored.start_line, end: stored.end_line };
  const patch = draftToPatch(draft, detail);
  const err = update.error ?? remove.error;
  const apiErr = err instanceof ApiError ? err : null;
  const outcome = detail.last_outcome?.outcome ?? null;
  const pending = update.isPending || remove.isPending;

  function save() {
    if (!patch) return;
    update.mutate({ id: detail.id, patch }, { onSuccess: onClose });
  }

  function confirmDelete() {
    remove.mutate(detail.id, { onSuccess: onClose });
  }

  return (
    <Modal
      width={EDITOR_WIDTH}
      title={t("caseEditor.caseTitle", { name: detail.name })}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          {err && (
            <span role="alert" style={s.error}>
              {t(`errors.${caseErrorKey(apiErr?.code)}`, caseErrorValues(apiErr?.details, draft))}
            </span>
          )}
          {confirmingDelete ? (
            <>
              <span style={s.confirm}>{t("caseEditor.deleteConfirm")}</span>
              <Button kind="danger" onClick={confirmDelete} disabled={pending}>
                {t("evalsTab.delete")}
              </Button>
              <Button kind="ghost" onClick={() => setConfirmingDelete(false)}>
                {tc("actions.cancel")}
              </Button>
            </>
          ) : (
            <>
              <Button kind="ghost" icon="Trash" onClick={() => setConfirmingDelete(true)} disabled={pending}>
                {t("evalsTab.delete")}
              </Button>
              <Button
                kind="primary"
                onClick={save}
                disabled={!isDraftValid(draft) || !patch || pending}
              >
                {update.isPending ? t("caseEditor.saving") : t("caseEditor.save")}
              </Button>
            </>
          )}
        </div>
      }
    >
      <p style={s.banner}>{t(stored.type === "must_find" ? "banner.positive" : "banner.negative", range)}</p>

      <div ref={bodyRef}>
        <CaseFormFields draft={draft} onChange={(p) => setDraft((d) => ({ ...d, ...p }))} files={detail.input_files} />
      </div>

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
            {outcome.error_reason && <p style={s.muted}>{outcome.error_reason}</p>}
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
    </Modal>
  );
}
