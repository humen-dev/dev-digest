import type { CSSProperties } from "react";

/** Co-located styles for DocPreview. */
export const s = {
  wrap: { padding: "20px 24px" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" } satisfies CSSProperties,
  path: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  tokens: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  saved: {
    fontSize: 12.5,
    fontWeight: 600,
    color: "var(--ok)",
  } satisfies CSSProperties,
  usage: { fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 14, display: "flex", gap: 6, flexWrap: "wrap" } satisfies CSSProperties,
  usageLabel: { color: "var(--text-muted)" } satisfies CSSProperties,
  body: { fontSize: 14 } satisfies CSSProperties,
} as const;
