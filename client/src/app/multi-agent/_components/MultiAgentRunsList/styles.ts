import type { CSSProperties } from "react";
import { ROW_GRID_COLUMNS } from "./constants";

export const s = {
  page: { padding: "24px 28px 40px", maxWidth: 1100, margin: "0 auto" } satisfies CSSProperties,
  head: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 18,
  } satisfies CSSProperties,
  h1: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  configureLink: {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 12px",
    borderRadius: 8,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    fontSize: 13,
    fontWeight: 600,
    textDecoration: "none",
  } satisfies CSSProperties,
  table: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    overflow: "hidden",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  headerRow: {
    display: "grid",
    gridTemplateColumns: ROW_GRID_COLUMNS,
    gap: 12,
    padding: "8px 14px",
    borderBottom: "1px solid var(--border)",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  footer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 10,
    marginTop: 16,
  } satisfies CSSProperties,
  inlineError: { fontSize: 12.5, color: "var(--crit)" } satisfies CSSProperties,
} as const;
