import type { CSSProperties } from "react";

export const s = {
  table: {
    border: "1px solid var(--border)",
    borderRadius: 9,
    overflow: "hidden",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  header: (columns: string): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: columns,
    gap: 12,
    padding: "9px 16px",
    background: "var(--bg-surface)",
    borderBottom: "1px solid var(--border)",
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.05em",
    color: "var(--text-muted)",
    textTransform: "uppercase",
  }),
  row: (columns: string, selected: boolean, clickable: boolean, last: boolean): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: columns,
    gap: 12,
    padding: "10px 16px",
    alignItems: "center",
    fontSize: 12.5,
    cursor: clickable ? "pointer" : "default",
    background: selected ? "var(--bg-hover)" : "transparent",
    borderBottom: last ? "none" : "1px solid var(--border)",
  }),
  mono: { fontSize: 12 } satisfies CSSProperties,
  muted: { color: "var(--text-muted)" } satisfies CSSProperties,
  status: (status: "running" | "completed" | "errored"): CSSProperties => ({
    fontWeight: 600,
    color:
      status === "errored" ? "var(--crit)" : status === "running" ? "var(--warn)" : "var(--ok)",
  }),
};
