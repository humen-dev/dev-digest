import type { FindingRecord, Severity } from "@devdigest/shared";

/** Fixed display order for the severity counters (most severe first). */
export const SEVERITY_LEVELS: Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];

export type SeverityCounts = Record<Severity, number>;

/** Count one review run's findings by severity (dismissed included — they still
 *  render as cards below, so the pill count matches the list). Pure grouping —
 *  no LLM. */
export function runSeverityCounts(findings: FindingRecord[]): SeverityCounts {
  const counts: SeverityCounts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) {
    if (f.severity in counts) counts[f.severity] += 1;
  }
  return counts;
}
