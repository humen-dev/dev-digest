import type { CSSProperties } from "react";

export const s = {
  heading: { fontSize: 14, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  note: { fontSize: 11.5, color: "var(--text-muted)", margin: "4px 0 12px" } satisfies CSSProperties,
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 } satisfies CSSProperties,
  cardTitle: { fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 14 } satisfies CSSProperties,
  none: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
};
