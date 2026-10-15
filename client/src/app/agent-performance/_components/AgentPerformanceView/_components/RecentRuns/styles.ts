import type { CSSProperties } from "react";

export const s = {
  wrap: { padding: "0 18px 14px 56px" } satisfies CSSProperties,
  empty: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12 } satisfies CSSProperties,
  th: {
    textAlign: "left",
    padding: "4px 10px 4px 0",
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  td: { padding: "4px 10px 4px 0", color: "var(--text-secondary)" } satisfies CSSProperties,
};
