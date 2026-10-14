import type { CSSProperties } from "react";

/** Co-located styles for the recent-runs list. */
export const s = {
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "9px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    fontSize: 12.5,
  } satisfies CSSProperties,
  repo: { flex: 1, fontWeight: 600 } satisfies CSSProperties,
  muted: { color: "var(--text-muted)" } satisfies CSSProperties,
  link: { display: "inline-block", marginTop: 10, fontSize: 13, color: "var(--accent)" } satisfies CSSProperties,
} as const;
