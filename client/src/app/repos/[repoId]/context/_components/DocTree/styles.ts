import type { CSSProperties } from "react";

/** Co-located styles for DocTree. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", height: "100%" } satisfies CSSProperties,
  list: { flex: 1, overflow: "auto", padding: "6px 0" } satisfies CSSProperties,
  folder: { display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", marginTop: 4 } satisfies CSSProperties,
  folderLabel: {
    fontSize: 11.5,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  fileBtn: (selected: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "6px 14px 6px 28px",
    border: "none",
    background: selected ? "var(--bg-hover)" : "transparent",
    color: selected ? "var(--text-primary)" : "var(--text-secondary)",
    fontWeight: selected ? 600 : 500,
    fontSize: 13,
    textAlign: "left",
    cursor: "pointer",
  }),
  fileName: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  capped: {
    padding: "6px 14px",
    fontSize: 12,
    color: "var(--text-muted)",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  footer: {
    padding: "10px 14px",
    borderTop: "1px solid var(--border)",
    fontSize: 12,
    color: "var(--text-muted)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  } satisfies CSSProperties,
} as const;
