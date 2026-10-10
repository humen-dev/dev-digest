import type { CSSProperties } from "react";

export const s = {
  wrap: { padding: 24, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  field: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  label: { fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" } satisfies CSSProperties,
  row: { display: "grid", gridTemplateColumns: "180px 1fr 110px 110px", gap: 12 } satisfies CSSProperties,
  legend: { fontSize: 13, fontWeight: 700, marginBottom: 8, padding: 0 } satisfies CSSProperties,
  fieldset: { border: "none", margin: 0, padding: 0 } satisfies CSSProperties,
  files: { display: "flex", flexDirection: "column", gap: 4, listStyle: "none", margin: 0, padding: "6px 0" } satisfies CSSProperties,
  tabBody: { paddingTop: 12 } satisfies CSSProperties,
  meta: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  locked: { display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" } satisfies CSSProperties,
  lockedHint: { fontSize: 11, color: "var(--text-secondary)" } satisfies CSSProperties,
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
} as const;
