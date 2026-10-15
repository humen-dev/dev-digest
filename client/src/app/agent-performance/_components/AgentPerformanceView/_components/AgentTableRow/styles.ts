import type { CSSProperties } from "react";

export const s = {
  row: (dimmed: boolean): CSSProperties => ({ opacity: dimmed ? 0.55 : 1 }),
  td: {
    padding: "12px 12px",
    borderBottom: "1px solid var(--border)",
    verticalAlign: "middle",
    fontSize: 12.5,
  } satisfies CSSProperties,
  agentCell: { display: "flex", alignItems: "center", gap: 6, minWidth: 0, maxWidth: 320 } satisfies CSSProperties,
  expand: {
    background: "none",
    border: "none",
    padding: 2,
    cursor: "pointer",
    color: "var(--text-muted)",
    display: "inline-flex",
    flexShrink: 0,
  } satisfies CSSProperties,
  rateCell: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" } satisfies CSSProperties,
  rate: (good: boolean): CSSProperties => ({
    fontSize: 13,
    fontWeight: 600,
    color: good ? "var(--ok)" : "var(--warn)",
  }),
  arrow: (up: boolean): CSSProperties => ({ color: up ? "var(--ok)" : "var(--crit)", display: "inline-flex" }),
  muted: { color: "var(--text-muted)" } satisfies CSSProperties,
  link: { color: "var(--accent-text)", fontSize: 12, fontWeight: 600 } satisfies CSSProperties,
  detail: { borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
};
