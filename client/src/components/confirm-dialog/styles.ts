import type { CSSProperties } from "react";

/** Co-located styles for ConfirmDialog. */
export const s = {
  body: { padding: "20px 24px", fontSize: 14, lineHeight: 1.55, color: "var(--text-secondary)" } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
} as const;
