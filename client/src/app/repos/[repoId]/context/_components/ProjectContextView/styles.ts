import type { CSSProperties } from "react";

/** Co-located styles for ProjectContextView. */
export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1240, margin: "0 auto" } satisfies CSSProperties,
  h1: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 16 } satisfies CSSProperties,
  layout: {
    display: "flex",
    minHeight: 480,
    border: "1px solid var(--border)",
    borderRadius: 10,
    overflow: "hidden",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  tree: { width: 280, flexShrink: 0, borderRight: "1px solid var(--border)" } satisfies CSSProperties,
  detail: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column" } satisfies CSSProperties,
  hint: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
