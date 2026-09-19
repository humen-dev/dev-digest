import type { CSSProperties } from "react";

/** Co-located styles for FindingsPreviewList (the hover-popover body). */
export const s = {
  title: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    margin: "2px 4px 8px",
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  item: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "9px 11px",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  itemHead: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 5,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  itemTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  meta: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 5,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  loc: { fontSize: 11.5, color: "var(--accent-text)" } satisfies CSSProperties,
  rationale: {
    fontSize: 12,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } satisfies CSSProperties,
} as const;
