import type { CSSProperties } from "react";

export const s = {
  nav: {
    position: "sticky",
    top: 16,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  title: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    color: "var(--text-muted)",
    textTransform: "uppercase",
  } satisfies CSSProperties,
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    listStyle: "none",
    margin: 0,
    padding: 0,
  } satisfies CSSProperties,
  link: (active: boolean): CSSProperties => ({
    display: "block",
    padding: "6px 10px",
    borderRadius: 6,
    fontSize: 13,
    textDecoration: "none",
    color: active ? "var(--text-primary)" : "var(--text-secondary)",
    fontWeight: active ? 600 : 400,
    background: active ? "var(--bg-hover)" : "transparent",
    borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
  }),
} as const;
