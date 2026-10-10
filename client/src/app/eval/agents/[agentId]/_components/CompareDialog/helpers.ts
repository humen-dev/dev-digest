import type { EvalCompare } from "@devdigest/shared";
import { formatDeltaPoints, formatPercent, formatRunCost } from "@/lib/eval-format";

export type CompareRowKey = "recall" | "precision" | "citation_accuracy" | "cost_usd";

export interface CompareRow {
  key: CompareRowKey;
  /** `eval.metrics.*` / `eval.dashboard.table.*` label key. */
  labelKey: "metrics.recall" | "metrics.precision" | "metrics.citation" | "dashboard.table.cost";
  older: string;
  newer: string;
  /** Signed delta text; null when either side is not applicable. */
  delta: string | null;
  /** True for the delta unit "pt" (ratios); the cost delta is a signed amount. */
  inPoints: boolean;
}

const ROWS: readonly { key: CompareRowKey; labelKey: CompareRow["labelKey"] }[] = [
  { key: "recall", labelKey: "metrics.recall" },
  { key: "precision", labelKey: "metrics.precision" },
  { key: "citation_accuracy", labelKey: "metrics.citation" },
  { key: "cost_usd", labelKey: "dashboard.table.cost" },
];

function signedCost(delta: number | null): string | null {
  if (delta == null || Number.isNaN(delta)) return null;
  if (delta === 0) return "0";
  return `${delta > 0 ? "+" : "−"}${formatRunCost(Math.abs(delta))}`;
}

/** The four old → new rows of the Compare dialog (AC-52), over the common cases only. */
export function buildCompareRows(metrics: EvalCompare["metrics"], notApplicable: string): CompareRow[] {
  return ROWS.map(({ key, labelKey }) => {
    const m = metrics[key];
    const isCost = key === "cost_usd";
    return {
      key,
      labelKey,
      older: isCost ? formatRunCost(m.older) : formatPercent(m.older, notApplicable),
      newer: isCost ? formatRunCost(m.newer) : formatPercent(m.newer, notApplicable),
      delta: isCost ? signedCost(m.delta) : formatDeltaPoints(m.delta),
      inPoints: !isCost,
    };
  });
}

/** Marker shown before a prompt-diff line (the colour is secondary — NFR-8). */
export const DIFF_MARKER = { add: "+", remove: "−", same: " " } as const;
