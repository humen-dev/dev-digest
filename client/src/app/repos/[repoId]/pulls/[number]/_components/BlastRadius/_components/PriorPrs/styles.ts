import type { CSSProperties } from "react";

export const s = {
  wrap: {
    marginTop: 14,
    paddingTop: 12,
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  toggle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "8px 12px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "transparent",
    color: "var(--text-secondary)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "left",
  } satisfies CSSProperties,
  title: { flex: 1 } satisfies CSSProperties,
  body: { display: "flex", flexDirection: "column", gap: 10, padding: "12px 4px 0" } satisfies CSSProperties,
  message: { fontSize: 13, color: "var(--text-secondary)", margin: 0 } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  item: { display: "flex", flexDirection: "column", gap: 3, fontSize: 13 } satisfies CSSProperties,
  prTitle: { fontWeight: 600, color: "var(--text-primary)", textDecoration: "none" } satisfies CSSProperties,
  meta: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  files: { fontSize: 12, color: "var(--text-secondary)", wordBreak: "break-all" } satisfies CSSProperties,
  footnote: { fontSize: 12, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
} as const;
