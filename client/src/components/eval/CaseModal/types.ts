import type React from "react";
import type {
  EvalCase,
  EvalCaseDetail,
  EvalCaseDraft,
  EvalCaseRunResult,
  EvalExpectation,
  EvalExpectationType,
} from "@devdigest/shared";

/** Editable form state of an eval case (shared by all three modal modes). */
export interface CaseDraft {
  name: string;
  notes: string;
  diff: string;
  prTitle: string;
  prBody: string;
  type: EvalExpectationType;
  file: string;
  startLine: string;
  endLine: string;
}

/** What the modal edits: a draft from a finding, a blank manual case, or a stored case. */
export type CaseModalProps = {
  agentId: string;
  /** Called with the stored case after a successful save; the parent closes the modal. */
  onSaved: (c: EvalCase) => void;
  onClose: () => void;
  /** Left side of the footer (e.g. delete). */
  footerExtra?: React.ReactNode;
  /** Below the form (e.g. source link, last outcome). */
  bodyExtra?: React.ReactNode;
} & (
  | { mode: "finding"; findingId: string; draft: EvalCaseDraft }
  | { mode: "manual" }
  | { mode: "saved"; detail: EvalCaseDetail }
);

/** The last Run case result, the expectation it ran against, and the content key it is fresh for. */
export interface WarmupRun {
  result: EvalCaseRunResult;
  expectation: EvalExpectation;
  key: string;
}
