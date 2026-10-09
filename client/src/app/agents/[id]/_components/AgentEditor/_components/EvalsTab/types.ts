import type { EvalExpectationType } from "@devdigest/shared";

/** Editable form state of an eval case (shared by the case editor and the New case form). */
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
