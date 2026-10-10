import type { CSSProperties } from "react";

export const s = {
  list: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-surface)",
    overflow: "hidden",
  } satisfies CSSProperties,
} as const;
