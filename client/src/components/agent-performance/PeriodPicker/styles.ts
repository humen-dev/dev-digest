import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 } satisfies CSSProperties,
  group: { display: "flex", gap: 4 } satisfies CSSProperties,
  label: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  custom: { display: "flex", alignItems: "flex-end", gap: 8 } satisfies CSSProperties,
  field: { display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
  fieldLabel: { fontSize: 11, color: "var(--text-muted)" } satisfies CSSProperties,
  input: {
    padding: "5px 8px",
    fontSize: 12.5,
    color: "var(--text-primary)",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    borderRadius: 6,
  } satisfies CSSProperties,
  error: { width: "100%", fontSize: 12.5, color: "var(--crit)" } satisfies CSSProperties,
};
