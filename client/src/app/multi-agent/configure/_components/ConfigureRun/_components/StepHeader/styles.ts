import type { CSSProperties } from "react";

export const s = {
  row: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 } satisfies CSSProperties,
  badge: {
    width: 22,
    height: 22,
    borderRadius: 99,
    fontSize: 12,
    fontWeight: 700,
    display: "grid",
    placeItems: "center",
  } satisfies CSSProperties,
  badgeOn: { background: "var(--accent-bg)", color: "var(--accent-text)" } satisfies CSSProperties,
  badgeOff: { background: "var(--bg-hover)", color: "var(--text-muted)" } satisfies CSSProperties,
  title: { fontSize: 13.5, fontWeight: 600 } satisfies CSSProperties,
} as const;
