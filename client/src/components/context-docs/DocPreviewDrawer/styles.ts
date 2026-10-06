import type { CSSProperties } from "react";

/** Co-located styles for DocPreviewDrawer. */
export const s = {
  meta: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" } satisfies CSSProperties,
  usage: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  tokens: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  card: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-surface)",
    padding: 16,
  } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
