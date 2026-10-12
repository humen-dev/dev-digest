"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, IconBtn } from "@devdigest/ui";
import type { CiTrigger, CiPostAs } from "@devdigest/shared";
import { Stepper } from "./_components/Stepper";
import { TargetStep } from "./_components/TargetStep";
import { PreviewStep } from "./_components/PreviewStep";
import { ConfigureStep } from "./_components/ConfigureStep";
import { InstallStep } from "./_components/InstallStep";
import { STEP_INDEX, STEP_KEYS } from "./constants";
import { providerNotSupported } from "./helpers";
import { s } from "./styles";
import { useFocusTrap } from "./useFocusTrap";
import { useWizardState } from "./useWizardState";

export interface ExportWizardProps {
  agentId: string;
  agentName: string;
  open: boolean;
  onClose: () => void;
  initial?: { step: "target" | "preview"; repo?: string; triggers?: CiTrigger[]; post_as?: CiPostAs };
}

/** SPEC-07 — Target → Preview → Configure → Install. Mounted only while open, so it starts fresh each time. */
export function ExportWizard({ open, ...props }: ExportWizardProps) {
  return open ? <WizardDialog {...props} /> : null;
}

function WizardDialog({ agentId, agentName, onClose, initial }: Omit<ExportWizardProps, "open">) {
  const t = useTranslations("ci.exportWizard");
  const w = useWizardState(agentId, initial);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const onKeyDown = useFocusTrap(dialogRef, w.pendingChange ? w.cancelChange : onClose);

  const violations = w.preview?.workflow_violations.length ?? 0;
  const canContinue = [
    w.repoValid && !(w.requested && w.previewFetching) && !providerNotSupported(w.previewError),
    !!w.preview && violations === 0 && !w.draftSettling && !w.previewFetching && !w.previewError,
    w.triggers.length > 0,
    false,
  ][w.step];

  const onContinue = () => (w.step === STEP_INDEX.target ? w.requestPreview() : w.setStep(w.step + 1));

  return (
    <div style={s.overlay}>
      <div style={s.backdrop} onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ci-wizard-title"
        tabIndex={-1}
        style={s.dialog}
        onKeyDown={onKeyDown}
      >
        <div style={s.header}>
          <div style={s.headerText}>
            <div id="ci-wizard-title" style={s.title}>
              {t("title")}
            </div>
            <div style={s.subtitle}>{t("subtitle", { agentName })}</div>
          </div>
          <IconBtn icon="X" label={t("close")} onClick={onClose} />
        </div>
        <div style={s.stepsBar}>
          <Stepper step={w.step} labels={STEP_KEYS.map((k) => t(`steps.${k}`))} />
        </div>

        {w.pendingChange ? (
          <div style={s.body} role="alertdialog" aria-labelledby="ci-regenerate-title">
            <div id="ci-regenerate-title" style={s.title}>
              {t("regenerateTitle")}
            </div>
            <p style={s.hint}>{t("regenerateBody")}</p>
            <div style={s.row}>
              <Button kind="primary" onClick={w.confirmChange}>
                {t("regenerateConfirm")}
              </Button>
              <Button autoFocus onClick={w.cancelChange}>
                {t("regenerateCancel")}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div style={s.body}>
              {w.step === STEP_INDEX.target && (
                <TargetStep
                  repo={w.repo}
                  onRepo={w.setRepo}
                  repoValid={w.repoValid}
                  previewError={w.previewError}
                  onClose={onClose}
                />
              )}
              {w.step === STEP_INDEX.preview && (
                <PreviewStep preview={w.preview} error={w.previewError} draft={w.draft} onDraft={w.setDraft} />
              )}
              {w.step === STEP_INDEX.configure && (
                <ConfigureStep
                  agentId={agentId}
                  repo={w.repo}
                  triggers={w.triggers}
                  onTriggers={w.changeTriggers}
                  postAs={w.postAs}
                  onPostAs={w.changePostAs}
                />
              )}
              {w.step === STEP_INDEX.install && (
                <InstallStep agentId={agentId} input={w.installInput} fileCount={w.preview?.files.length ?? 0} />
              )}
            </div>
            <div style={s.footer}>
              <div>
                {w.step > STEP_INDEX.target && <Button onClick={() => w.setStep(w.step - 1)}>{t("back")}</Button>}
              </div>
              {w.step < STEP_INDEX.install && (
                <Button kind="primary" iconRight="ArrowRight" onClick={onContinue} disabled={!canContinue}>
                  {t("continue")}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
