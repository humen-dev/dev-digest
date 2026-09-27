import type { CSSProperties } from "react";

export const s = {
  label: {
    fontSize: 11.5,
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 8,
  } satisfies CSSProperties,
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    margin: 0,
    padding: 0,
    listStyle: "none",
  } satisfies CSSProperties,
  item: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    fontSize: 13.5,
    color: "var(--text-secondary)",
    lineHeight: 1.45,
  } satisfies CSSProperties,
  checkIcon: { color: "var(--ok)", flexShrink: 0, marginTop: 2 } satisfies CSSProperties,
  crossIcon: { color: "var(--text-muted)", flexShrink: 0, marginTop: 2 } satisfies CSSProperties,
} as const;
