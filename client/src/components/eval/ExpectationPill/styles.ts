import type { CSSProperties } from "react";

export const s = {
  pill: (positive: boolean): CSSProperties => ({
    display: "inline-block",
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.04em",
    padding: "1px 7px",
    borderRadius: 4,
    whiteSpace: "nowrap",
    color: positive ? "var(--accent-text)" : "var(--text-muted)",
    background: positive ? "var(--accent-bg)" : "var(--bg-hover)",
    border: "1px solid " + (positive ? "var(--accent)" : "var(--border-strong)"),
  }),
};
