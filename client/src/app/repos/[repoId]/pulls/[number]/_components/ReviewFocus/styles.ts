import type { CSSProperties } from "react";

export const s = {
  block: {
    width: "100%",
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    padding: "14px 16px",
  } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 } satisfies CSSProperties,
  title: {
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.06em",
    color: "var(--text-muted)",
    textTransform: "uppercase",
    margin: 0,
  } satisfies CSSProperties,
  list: {
    margin: 0,
    padding: 0,
    listStyle: "none",
    display: "flex",
    flexDirection: "column",
    gap: 2,
  } satisfies CSSProperties,
  item: {
    display: "flex",
    alignItems: "baseline",
    gap: 9,
    width: "100%",
    padding: "7px 8px",
    borderRadius: 6,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    textAlign: "left",
  } satisfies CSSProperties,
  marker: { color: "var(--accent)", fontSize: 12, flexShrink: 0 } satisfies CSSProperties,
  location: {
    fontSize: 11.5,
    color: "var(--accent-text)",
    flexShrink: 0,
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  reason: { fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.4 } satisfies CSSProperties,
  empty: { fontSize: 13.5, color: "var(--text-secondary)", margin: 0 } satisfies CSSProperties,
} as const;
