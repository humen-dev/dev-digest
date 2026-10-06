import type { CSSProperties } from "react";

export const s = {
  stack: { display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
} as const;
