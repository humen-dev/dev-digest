import type { CSSProperties } from "react";

/** Co-located styles for an installation row. */
export const s = {
  row: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: "13px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  main: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" } satisfies CSSProperties,
  icon: { color: "var(--text-muted)" } satisfies CSSProperties,
  repo: { fontSize: 13, fontWeight: 600, flex: 1 } satisfies CSSProperties,
  meta: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    fontSize: 11.5,
    color: "var(--text-muted)",
    paddingLeft: 28,
  } satisfies CSSProperties,
  drift: { display: "flex", alignItems: "center", gap: 10, paddingLeft: 28 } satisfies CSSProperties,
  driftText: { fontSize: 12, color: "var(--warn)" } satisfies CSSProperties,
} as const;
