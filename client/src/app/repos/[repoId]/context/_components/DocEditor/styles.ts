import type { CSSProperties } from "react";

/** Co-located styles for DocEditor. */
export const s = {
  wrap: { padding: "20px 24px", display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  path: { fontSize: 13, color: "var(--text-secondary)", marginBottom: 2 } satisfies CSSProperties,
  warning: {
    fontSize: 12.5,
    color: "var(--warn)",
    background: "var(--warn-bg)",
    border: "1px solid var(--warn)",
    borderRadius: 7,
    padding: "8px 12px",
    lineHeight: 1.5,
  } satisfies CSSProperties,
  textarea: {
    width: "100%",
    minHeight: 360,
    resize: "vertical",
    padding: "12px 14px",
    borderRadius: 7,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    fontSize: 13.5,
    lineHeight: 1.6,
    outline: "none",
  } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  error: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--crit)",
  } satisfies CSSProperties,
} as const;
