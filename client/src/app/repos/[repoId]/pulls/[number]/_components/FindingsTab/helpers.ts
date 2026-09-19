import type { ReviewRecord, Severity } from "@devdigest/shared";

/** Fixed display order for the severity counters (most severe first). */
export const SEVERITY_LEVELS: Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];

export type SeverityCounts = Record<Severity, number>;

/** Total findings by severity across every review run (dismissed included —
 *  they still render in the list, so the headline count stays stable). */
export function severityCounts(runs: ReviewRecord[]): SeverityCounts {
  const counts: SeverityCounts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const run of runs) {
    for (const f of run.findings) {
      if (f.severity in counts) counts[f.severity] += 1;
    }
  }
  return counts;
}

/** True when a run has at least one finding of the given severity. */
export function runHasSeverity(review: ReviewRecord, sev: Severity): boolean {
  return review.findings.some((f) => f.severity === sev);
}
