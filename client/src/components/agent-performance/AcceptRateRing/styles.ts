import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  svg: { flexShrink: 0 } satisfies CSSProperties,
  value: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  caption: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
};
