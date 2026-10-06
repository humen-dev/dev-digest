import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  overview: { fontSize: 14, lineHeight: 1.6, color: "var(--text-secondary)" } satisfies CSSProperties,
  codeFence: { fontSize: "0.92em" } satisfies CSSProperties,
  codePill: {
    fontSize: "0.92em",
    padding: "1px 6px",
    borderRadius: 4,
    background: "var(--bg-hover)",
    color: "var(--accent-text)",
  } satisfies CSSProperties,
  pathChip: {
    fontSize: "0.92em",
    padding: "1px 6px",
    borderRadius: 4,
    background: "var(--accent-bg)",
    fontWeight: 600,
  } satisfies CSSProperties,
} as const;
