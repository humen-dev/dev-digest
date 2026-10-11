import type { CSSProperties } from "react";

export const s = {
  wrap: (stale: boolean): CSSProperties => ({
    margin: "0 24px 16px",
    padding: 12,
    border: "1px solid var(--border)",
    borderRadius: 10,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    opacity: stale ? 0.55 : 1,
  }),
  head: { fontSize: 13, display: "flex", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  verdict: { fontWeight: 700 } satisfies CSSProperties,
  muted: { fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  stale: { fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" } satisfies CSSProperties,
  h3: { fontSize: 13, fontWeight: 700, margin: "6px 0 0" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8, listStyle: "none", margin: 0, padding: 0 } satisfies CSSProperties,
  matched: { fontSize: 11, fontWeight: 700, marginLeft: 8, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
