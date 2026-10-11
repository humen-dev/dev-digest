"use client";

import { useEffect, useRef, useState } from "react";
import type { EvalCaseDetail } from "@devdigest/shared";
import { useRunEvalCase } from "@/lib/hooks/eval";
import { applyMasked, contentKey, draftFromCase, draftToPatch, draftToRunInput, isDraftValid } from "./helpers";
import type { CaseDraft, WarmupRun } from "./types";

/** Warm-up state of the case modal: the editable draft, the last Run case result and what it is fresh for.
 *  Nothing here is stored server-side (AC-95). `detail` is set only in `saved` mode. */
export function useCaseWarmup({
  agentId,
  initial,
  detail,
}: {
  agentId: string;
  initial: CaseDraft;
  detail?: EvalCaseDetail;
}) {
  const runMutation = useRunEvalCase(agentId);
  const [initialDraft] = useState(initial);
  const [draft, setDraftState] = useState<CaseDraft>(initial);
  const [run, setRun] = useState<WarmupRun | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<unknown>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  // Request token: a response that arrives after close or after a newer run is dropped (AC-107, EC-26).
  const token = useRef(0);
  useEffect(
    () => () => {
      token.current += 1;
    },
    [],
  );

  const key = contentKey(draft);
  const fresh = run != null && run.key === key;
  const scoredFresh = fresh && run.result.status === "scored";

  function change(patch: Partial<CaseDraft>) {
    setDraftState((d) => ({ ...d, ...patch }));
  }

  async function runCase() {
    const input = draftToRunInput(draftRef.current);
    if (!input || running) return;
    const mine = ++token.current;
    const requestKey = contentKey(draftRef.current);
    setRunning(true);
    setRunError(null);
    try {
      const result = await runMutation.mutateAsync(input);
      if (mine !== token.current) return;
      const current = draftRef.current;
      if (contentKey(current) === requestKey) {
        // EC-32: show the masked text the model actually saw; freshness is keyed on it.
        const next = applyMasked(current, result.masked);
        setDraftState(next);
        setRun({ result, expectation: input.expectation, key: contentKey(next) });
      } else {
        // Edited while running: keep the user's edits; the result is already stale.
        setRun({ result, expectation: input.expectation, key: requestKey });
      }
    } catch (e) {
      if (mine === token.current) setRunError(e);
    } finally {
      if (mine === token.current) setRunning(false);
    }
  }

  /** AC-100, AC-109, Q-8: new drafts need a fresh scored run; a stored case saves a name / notes-only change without one. */
  function canSave(): boolean {
    if (!isDraftValid(draft)) return false;
    if (!detail) return scoredFresh;
    if (!draftToPatch(draft, detail)) return false;
    return key === contentKey(draftFromCase(detail)) || scoredFresh;
  }

  return {
    draft,
    change,
    run,
    fresh,
    running,
    runError,
    runCase,
    canRun: draftToRunInput(draft) != null && !running,
    canSave: canSave(),
    dirty: JSON.stringify(draft) !== JSON.stringify(initialDraft),
    ran: run != null || running,
  };
}
