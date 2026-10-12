import type { CSSProperties } from "react";

export const s = {
  list: { display: "flex", alignItems: "center", margin: 0, padding: "0 5px", listStyle: "none" } satisfies CSSProperties,
  item: { display: "flex", alignItems: "center", gap: 10, flex: 1 } satisfies CSSProperties,
  dot: (done: boolean, active: boolean): CSSProperties => ({
    width: 24,
    height: 24,
    borderRadius: 99,
    display: "grid",
    placeItems: "center",
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
    background: done ? "var(--ok)" : active ? "var(--accent)" : "var(--bg-elevated)",
    color: done || active ? "#fff" : "var(--text-muted)",
    border: done || active ? "none" : "1px solid var(--border-strong)",
  }),
  label: (active: boolean, reached: boolean): CSSProperties => ({
    fontSize: 13,
    fontWeight: active ? 600 : 500,
    color: reached ? "var(--text-primary)" : "var(--text-muted)",
    whiteSpace: "nowrap",
  }),
  line: (done: boolean): CSSProperties => ({
    flex: 1,
    height: 1,
    minWidth: 24,
    margin: "0 14px",
    background: done ? "var(--ok)" : "var(--border-strong)",
  }),
} as const;
