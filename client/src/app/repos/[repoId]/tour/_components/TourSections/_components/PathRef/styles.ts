import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0, maxWidth: "100%" } satisfies CSSProperties,
  text: {
    display: "inline-block",
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    verticalAlign: "bottom",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  link: {
    display: "inline-block",
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    verticalAlign: "bottom",
    color: "var(--accent-text)",
    textDecoration: "none",
  } satisfies CSSProperties,
  importedBy: { fontSize: 12, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
} as const;
