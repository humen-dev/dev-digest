"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { useCreateEvalCase, useSaveEvalCaseFromFinding, useUpdateEvalCase } from "@/lib/hooks/eval";
import { EDITOR_WIDTH } from "./constants";
import {
  EMPTY_DRAFT,
  caseErrorKey,
  caseErrorValues,
  draftFromCase,
  draftFromFindingDraft,
  draftToInput,
  draftToPatch,
} from "./helpers";
import { s } from "./styles";
import type { CaseModalProps } from "./types";
import { useCaseWarmup } from "./useCaseWarmup";
import { useDialogKeyboard } from "./useDialogKeyboard";
import { CaseFormFields } from "./_components/CaseFormFields";
import { RunResult } from "./_components/RunResult";

/** One modal for the three ways to edit an eval case — a draft from a finding, a new manual case, a stored case.
 *  Nothing is stored until Save, and Save needs a fresh scored Run case (SPEC-06 AC-100); closing asks first (AC-105). */
export function CaseModal(props: CaseModalProps) {
  const { mode, agentId, onSaved, onClose, footerExtra, bodyExtra } = props;
  const t = useTranslations("eval");
  const tc = useTranslations("common");
  const detail = props.mode === "saved" ? props.detail : undefined;
  const saveFromFinding = useSaveEvalCaseFromFinding(props.mode === "finding" ? props.findingId : "");
  const create = useCreateEvalCase(agentId);
  const update = useUpdateEvalCase();
  const [confirming, setConfirming] = useState(false);
  const warm = useCaseWarmup({
    agentId,
    detail,
    initial: props.mode === "finding" ? draftFromFindingDraft(props.draft) : detail ? draftFromCase(detail) : EMPTY_DRAFT,
  });

  const saveMutation = mode === "finding" ? saveFromFinding : mode === "manual" ? create : update;
  const pending = saveMutation.isPending;

  function requestClose() {
    if (confirming) setConfirming(false);
    else if (warm.dirty || warm.ran) setConfirming(true);
    else onClose();
  }
  const bodyRef = useDialogKeyboard(requestClose);

  function save() {
    if (!warm.canSave || pending) return;
    if (detail) {
      const patch = draftToPatch(warm.draft, detail);
      if (patch) update.mutate({ id: detail.id, patch }, { onSuccess: onSaved });
      return;
    }
    const input = draftToInput(warm.draft);
    if (!input) return;
    (mode === "finding" ? saveFromFinding : create).mutate(input, { onSuccess: onSaved });
  }

  const err = warm.runError ?? saveMutation.error;
  const apiErr = err instanceof ApiError ? err : null;
  const title =
    mode === "finding"
      ? t("caseModal.draftTitle")
      : detail
        ? t("caseEditor.caseTitle", { name: detail.name })
        : t("caseModal.newTitle");
  const files = props.mode === "finding" ? props.draft.input_files : detail?.input_files;
  const stored = detail?.expectation;

  return (
    <Modal
      width={EDITOR_WIDTH}
      title={title}
      onClose={requestClose}
      footer={
        <div style={s.footer}>
          <div style={s.footerLeft}>{footerExtra}</div>
          {err != null && (
            <span role="alert" style={s.error}>
              {t(`errors.${caseErrorKey(apiErr?.code)}`, caseErrorValues(apiErr?.details, warm.draft))}
            </span>
          )}
          {confirming ? (
            <>
              <span role="status" style={s.confirm}>
                {t("caseModal.discardConfirm")}
              </span>
              <Button kind="danger" onClick={onClose}>
                {t("caseModal.discard")}
              </Button>
              <Button kind="ghost" onClick={() => setConfirming(false)}>
                {t("caseModal.keepEditing")}
              </Button>
            </>
          ) : (
            <>
              {!warm.canSave && (mode !== "saved" || warm.dirty) && <span style={s.hint}>{t("caseModal.saveGate")}</span>}
              <Button kind="ghost" onClick={requestClose}>
                {tc("actions.cancel")}
              </Button>
              <Button kind="secondary" onClick={warm.runCase} disabled={!warm.canRun || pending}>
                {warm.running ? t("caseModal.running") : t("caseModal.runCase")}
              </Button>
              <Button kind="primary" onClick={save} disabled={!warm.canSave || pending}>
                {pending ? t("caseEditor.saving") : t("caseEditor.save")}
              </Button>
            </>
          )}
        </div>
      }
    >
      {stored && (
        <p style={s.banner}>
          {t(stored.type === "must_find" ? "banner.positive" : "banner.negative", {
            file: stored.file,
            start: stored.start_line,
            end: stored.end_line,
          })}
        </p>
      )}

      <div ref={bodyRef}>
        <CaseFormFields draft={warm.draft} onChange={warm.change} files={files} lockedType={mode === "finding"} />
      </div>

      {warm.run && <RunResult run={warm.run} stale={!warm.fresh} />}
      {bodyExtra && <div style={s.extra}>{bodyExtra}</div>}
    </Modal>
  );
}
