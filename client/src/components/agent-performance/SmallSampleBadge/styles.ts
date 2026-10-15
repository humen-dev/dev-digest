import type { CSSProperties } from "react";

export const s = {
  badge: {
    display: "inline-block",
    padding: "2px 7px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    color: "var(--warn)",
    background: "var(--warn-bg)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
};
