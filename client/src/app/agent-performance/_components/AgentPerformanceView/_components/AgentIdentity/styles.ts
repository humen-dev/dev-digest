import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", alignItems: "center", gap: 10, minWidth: 0 } satisfies CSSProperties,
  tile: (color: string, background: string): CSSProperties => ({
    width: 28,
    height: 28,
    borderRadius: 7,
    background,
    color,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  }),
  text: { display: "flex", flexDirection: "column", minWidth: 0 } satisfies CSSProperties,
  nameRow: { display: "flex", alignItems: "center", gap: 8, minWidth: 0 } satisfies CSSProperties,
  name: {
    fontSize: 13.5,
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    minWidth: 0,
  } satisfies CSSProperties,
  sub: { fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,
};
