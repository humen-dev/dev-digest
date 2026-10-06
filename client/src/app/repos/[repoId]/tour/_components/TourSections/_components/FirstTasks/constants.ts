import type { TourComplexity } from "@devdigest/shared";

/** AC-23: Low/Medium/High badges coloured ok/warning/critical respectively. */
export const COMPLEXITY_TOKEN: Record<TourComplexity, { color: string; bg: string }> = {
  low: { color: "var(--ok)", bg: "var(--ok-bg)" },
  medium: { color: "var(--warn)", bg: "var(--warn-bg)" },
  high: { color: "var(--crit)", bg: "var(--crit-bg)" },
};
