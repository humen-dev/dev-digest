import type { CSSProperties } from "react";

/** Co-located styles for the agent Stats tab. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  grid: { display: "flex", gap: 12, flexWrap: "wrap" } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
  error: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  footerStack: { display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
};
