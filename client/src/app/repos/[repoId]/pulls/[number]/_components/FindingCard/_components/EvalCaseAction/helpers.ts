import { FINDING_ERROR_CODES, type FindingErrorCode } from "./constants";

/** Link to the created case in the agent's Evals tab (AC-12, plan decision 10). */
export function evalCaseHref(ownerId: string, caseId: string): string {
  return `/agents/${encodeURIComponent(ownerId)}?tab=evals&case=${encodeURIComponent(caseId)}`;
}

/** Maps an ApiError code to an `eval.errors.*` key; anything else is `generic`. */
export function findingErrorKey(code: string | undefined): FindingErrorCode | "generic" {
  return (FINDING_ERROR_CODES as readonly string[]).includes(code ?? "")
    ? (code as FindingErrorCode)
    : "generic";
}

/** ICU values for the messages that interpolate (`{file}` `{start}` `{end}`), read from `ApiError.details`. */
export function findingErrorValues(details: unknown): { file: string; start: number; end: number } {
  const d = (details ?? {}) as Record<string, unknown>;
  return {
    file: typeof d.file === "string" ? d.file : "",
    start: typeof d.start_line === "number" ? d.start_line : 0,
    end: typeof d.end_line === "number" ? d.end_line : 0,
  };
}
