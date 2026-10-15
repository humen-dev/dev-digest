import type { CSSProperties } from "react";

export const s = {
  card: {
    flex: 1,
    minWidth: 0,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 9,
    padding: 16,
  } satisfies CSSProperties,
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
    letterSpacing: "0.03em",
  } satisfies CSSProperties,
  skeleton: { marginTop: 10 } satisfies CSSProperties,
  valueRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 10,
  } satisfies CSSProperties,
  value: { fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  footer: { marginTop: 6, fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
};
