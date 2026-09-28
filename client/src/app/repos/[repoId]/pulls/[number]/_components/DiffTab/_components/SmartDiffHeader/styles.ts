import type { CSSProperties } from "react";

/** Co-located styles for SmartDiffHeader: eyebrow on its own line, then the
    PR-wide summary (left) and the controls (right) on one row. */
export const s = {
  wrap: { marginBottom: 14 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    marginTop: -4,
  } satisfies CSSProperties,
  summary: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  additions: { color: "var(--ok)" } satisfies CSSProperties,
  deletions: { color: "var(--crit)" } satisfies CSSProperties,
  controls: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
} as const;
