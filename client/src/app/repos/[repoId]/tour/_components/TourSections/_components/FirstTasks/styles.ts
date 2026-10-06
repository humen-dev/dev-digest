import type { CSSProperties } from "react";

export const s = {
  // Auto-fit collapses to one column once the content area is narrower than
  // ~2 * 240px, which covers EC-21's "under 768 px" narrow-viewport case
  // without a media query (no precedent for one at the component level).
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 12,
  } satisfies CSSProperties,
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: 12,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-hover)",
    minWidth: 0,
  } satisfies CSSProperties,
  title: { margin: 0, fontSize: 14, fontWeight: 650, color: "var(--text-primary)" } satisfies CSSProperties,
  target: {
    display: "inline-block",
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 6, marginTop: "auto" } satisfies CSSProperties,
} as const;
