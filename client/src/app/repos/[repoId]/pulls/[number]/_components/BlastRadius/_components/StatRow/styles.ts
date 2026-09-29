import type { CSSProperties } from "react";

export const s = {
  row: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 16,
    flex: 1,
    fontSize: 13.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  stat: { display: "inline-flex", alignItems: "center", gap: 5 } satisfies CSSProperties,
  icon: { display: "inline-flex", color: "var(--text-muted)" } satisfies CSSProperties,
  num: { color: "var(--text-primary)", fontWeight: 700 } satisfies CSSProperties,
  toggle: { marginLeft: "auto" } satisfies CSSProperties,
} as const;
