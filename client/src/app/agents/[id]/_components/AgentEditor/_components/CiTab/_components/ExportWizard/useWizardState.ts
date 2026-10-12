"use client";

import React from "react";
import type { CiPostAs, CiPreview, CiTrigger } from "@devdigest/shared";
import { useCiPreview } from "@/lib/hooks/ci";
import { DEFAULT_POST_AS, DEFAULT_TRIGGERS, STEP_INDEX, WORKFLOW_DEBOUNCE_MS } from "./constants";
import { buildInput, isRepoValid } from "./helpers";

export interface WizardInitial {
  step: "target" | "preview";
  repo?: string;
  triggers?: CiTrigger[];
  post_as?: CiPostAs;
}

/** A setting change held back until the user confirms dropping their workflow edit (EC-9). */
interface PendingChange {
  apply: () => void;
}

/**
 * Wizard state + the preview query it drives. The preview input is keyed on the whole
 * form, so changing a trigger / post-as regenerates it; a workflow edit joins the key
 * only after `WORKFLOW_DEBOUNCE_MS` of silence.
 */
export function useWizardState(agentId: string, initial: WizardInitial | undefined) {
  const [step, setStep] = React.useState<number>(initial?.step === "preview" ? STEP_INDEX.preview : STEP_INDEX.target);
  const [repo, setRepoValue] = React.useState(initial?.repo ?? "");
  const [triggers, setTriggers] = React.useState<CiTrigger[]>(initial?.triggers ?? DEFAULT_TRIGGERS);
  const [postAs, setPostAs] = React.useState<CiPostAs>(initial?.post_as ?? DEFAULT_POST_AS);
  const [draft, setDraft] = React.useState<string | null>(null);
  const [appliedDraft, setAppliedDraft] = React.useState<string | null>(null);
  const [requested, setRequested] = React.useState(false);
  const [pending, setPending] = React.useState<PendingChange | null>(null);

  // Debounce the workflow edit into the preview key; a regenerate (draft → null) applies at once.
  React.useEffect(() => {
    if (draft === null) {
      setAppliedDraft(null);
      return;
    }
    const timer = setTimeout(() => setAppliedDraft(draft), WORKFLOW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft]);

  const repoValid = isRepoValid(repo);
  const previewActive = repoValid && (requested || step >= STEP_INDEX.preview);
  const previewInput = previewActive
    ? buildInput({ repo, triggers, postAs, workflow: draft === null ? null : appliedDraft })
    : null;
  const query = useCiPreview(agentId, previewInput);

  // Keep the last good preview while a new one loads, so the workflow editor never unmounts mid-typing.
  const [lastPreview, setLastPreview] = React.useState<CiPreview | undefined>(undefined);
  if (query.data && query.data !== lastPreview) setLastPreview(query.data);
  const preview = query.data ?? lastPreview;

  // Target → Preview once the requested preview has arrived.
  React.useEffect(() => {
    if (requested && step === STEP_INDEX.target && query.isSuccess) {
      setStep(STEP_INDEX.preview);
      setRequested(false);
    }
  }, [requested, step, query.isSuccess]);

  const setRepo = (value: string) => {
    setRepoValue(value);
    setRequested(false);
  };

  /** Run `apply` now, or after confirmation when it would discard a workflow edit. */
  const guardedChange = (apply: () => void) => {
    if (draft === null) apply();
    else setPending({ apply });
  };

  const confirmChange = () => {
    pending?.apply();
    setDraft(null);
    setPending(null);
  };

  const requestPreview = () => {
    if (requested) void query.refetch();
    else setRequested(true);
  };

  return {
    step,
    setStep,
    repo,
    setRepo,
    repoValid,
    triggers,
    changeTriggers: (next: CiTrigger[]) => guardedChange(() => setTriggers(next)),
    postAs,
    changePostAs: (next: CiPostAs) => guardedChange(() => setPostAs(next)),
    draft,
    setDraft,
    /** The edit is still waiting for its debounced preview. */
    draftSettling: draft !== null && draft !== appliedDraft,
    installInput: buildInput({ repo, triggers, postAs, workflow: draft }),
    pendingChange: pending !== null,
    confirmChange,
    cancelChange: () => setPending(null),
    requested,
    requestPreview,
    preview,
    previewError: query.isError ? query.error : null,
    previewFetching: query.isFetching,
  };
}
