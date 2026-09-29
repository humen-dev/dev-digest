import type { CSSProperties } from "react";

export const s = {
  notice: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    padding: "9px 12px",
    marginBottom: 12,
    borderRadius: 8,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
    color: "var(--text-secondary)",
    fontSize: 13,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  text: { flex: 1, minWidth: 180 } satisfies CSSProperties,
  started: { color: "var(--text-muted)", fontSize: 12.5 } satisfies CSSProperties,
} as const;
