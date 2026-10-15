import type { CSSProperties } from "react";

export const s = {
  delta: (delta: number): CSSProperties => ({
    fontSize: 12,
    fontWeight: 600,
    color: delta < 0 ? "var(--ok)" : delta > 0 ? "var(--crit)" : "var(--text-muted)",
  }),
};
