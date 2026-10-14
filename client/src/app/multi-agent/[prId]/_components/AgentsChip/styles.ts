import type { CSSProperties } from "react";

export const s = {
  chip: {
    padding: "1px 7px",
    borderRadius: 99,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-hover)",
    color: "var(--text-secondary)",
    fontSize: 11.5,
    fontWeight: 600,
    cursor: "pointer",
  } satisfies CSSProperties,
  list: {
    flexBasis: "100%",
    margin: 0,
    padding: 8,
    listStyle: "none",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    borderRadius: 6,
    background: "var(--bg-hover)",
    cursor: "default",
  } satisfies CSSProperties,
  item: { display: "flex", flexDirection: "column", gap: 3 } satisfies CSSProperties,
  itemHead: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  agent: { fontSize: 12, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  severity: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  title: { fontSize: 12.5, color: "var(--text-primary)" } satisfies CSSProperties,
  rationale: {
    margin: 0,
    fontSize: 12.5,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
  } satisfies CSSProperties,
} as const;
