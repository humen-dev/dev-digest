import type { CSSProperties } from "react";

export const s = {
  notes: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
};
