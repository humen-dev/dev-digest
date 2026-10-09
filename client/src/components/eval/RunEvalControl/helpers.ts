import { RUN_ERROR_CODES, type RunErrorCode } from "./constants";

/** Maps an ApiError code or a run's `error_reason` to an `eval.errors.*` key; otherwise `generic`. */
export function runErrorKey(code: string | null | undefined): RunErrorCode | "generic" {
  return (RUN_ERROR_CODES as readonly string[]).includes(code ?? "") ? (code as RunErrorCode) : "generic";
}

/** ICU values for `{provider}` and `{count}`, read from `ApiError.details`. */
export function runErrorValues(details: unknown): { provider: string; count: number } {
  const d = (details ?? {}) as Record<string, unknown>;
  const count = typeof d.count === "number" ? d.count : typeof d.cases_total === "number" ? d.cases_total : 0;
  return { provider: typeof d.provider === "string" ? d.provider : "", count };
}
