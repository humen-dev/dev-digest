import type { CSSProperties } from "react";

/** Co-located styles for CreateTab. */
export const s = {
  body: { display: "flex", flexDirection: "column", gap: 4, padding: "20px 24px 8px" } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 10, padding: "12px 24px 20px" } satisfies CSSProperties,
  footerNote: { flex: 1, fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
