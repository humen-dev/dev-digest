import type { CSSProperties } from "react";

/** Co-located styles for SmartDiffHeader. */
export const s = {
  right: { display: "flex", alignItems: "center", gap: 14 } satisfies CSSProperties,
  summary: { fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
