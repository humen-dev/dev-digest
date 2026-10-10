import type { EvalRunRecord } from "@devdigest/shared";
import { CASE_ERROR_CODES } from "./constants";

/** Maps an ApiError code to an `eval.errors.*` key; unknown codes fall back to `generic`. */
export function caseErrorKey(code: string | null | undefined): string {
  return (CASE_ERROR_CODES as readonly string[]).includes(code ?? "") ? (code as string) : "generic";
}

/** ICU values the `eval.errors.*` messages may reference. */
export function caseErrorValues(details: unknown) {
  const x = (details ?? {}) as Record<string, unknown>;
  return {
    provider: typeof x.provider === "string" ? x.provider : "",
    count: typeof x.count === "number" ? x.count : 0,
    file: "",
    start: "",
    end: "",
  };
}

/** Per-metric change of the latest run against the previous one (0..1 ratios); null when either side is missing. */
export function metricDeltas(latest: EvalRunRecord | null, previous: EvalRunRecord | null) {
  const a = latest?.metrics;
  const b = previous?.metrics;
  if (!a || !b) return undefined;
  const diff = (x: number | null, y: number | null) => (x == null || y == null ? null : x - y);
  return {
    recall: diff(a.recall, b.recall),
    precision: diff(a.precision, b.precision),
    citation_accuracy: diff(a.citation_accuracy, b.citation_accuracy),
  };
}
