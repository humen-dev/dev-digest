import type { CSSProperties } from "react";

export const s = {
  footer: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)", marginRight: "auto" } satisfies CSSProperties,
} as const;
