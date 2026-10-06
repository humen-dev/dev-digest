import type { CSSProperties } from "react";

export const s = {
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 10px",
    borderRadius: 6,
    background: "var(--bg-hover)",
    minWidth: 0,
  } satisfies CSSProperties,
  icon: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  path: {
    display: "inline-block",
    maxWidth: 320,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: "var(--text-primary)",
    fontWeight: 600,
  } satisfies CSSProperties,
  note: { color: "var(--text-secondary)", flex: 1, minWidth: 0 } satisfies CSSProperties,
  importedBy: { fontSize: 12, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  open: { flexShrink: 0, fontSize: 13, fontWeight: 600 } satisfies CSSProperties,
} as const;
