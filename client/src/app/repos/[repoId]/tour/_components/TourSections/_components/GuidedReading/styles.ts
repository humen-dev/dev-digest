import type { CSSProperties } from "react";

export const s = {
  list: { listStyleType: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  row: { display: "flex", alignItems: "flex-start", gap: 10 } satisfies CSSProperties,
  badge: {
    width: 18,
    height: 18,
    flexShrink: 0,
    marginTop: 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 99,
    background: "var(--accent-bg)",
    color: "var(--accent-text)",
    fontSize: 11,
    fontWeight: 700,
  } satisfies CSSProperties,
  content: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 } satisfies CSSProperties,
  path: { fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  reason: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
