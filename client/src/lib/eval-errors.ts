/** Codes of eval run refusals (and a run's `error_reason`) that have an `eval.errors.*` message. */
export const RUN_ERROR_CODES = [
  "run_in_flight",
  "no_cases",
  "provider_key_missing",
  "too_many_cases",
] as const;

export type RunErrorCode = (typeof RUN_ERROR_CODES)[number];

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

/**
 * Message key and values for a refusal that carries `details`. When the message needs a value
 * the details do not hold (`provider` / `count`), it degrades to `generic` instead of rendering blanks.
 */
export function refusalMessage(
  code: string | null | undefined,
  details: unknown,
): { key: RunErrorCode | "generic"; values: { provider: string; count: number } } {
  const key = runErrorKey(code);
  const values = runErrorValues(details);
  const missing =
    (key === "provider_key_missing" && values.provider === "") || (key === "too_many_cases" && values.count === 0);
  return { key: missing ? "generic" : key, values };
}
