import type { CSSProperties } from "react";

export const s = {
  footer: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)", marginRight: "auto" } satisfies CSSProperties,
  confirm: { fontSize: 13, color: "var(--text-secondary)", marginRight: "auto" } satisfies CSSProperties,
  banner: {
    margin: 0,
    padding: "12px 24px",
    fontSize: 13,
    fontWeight: 600,
    background: "var(--bg-surface)",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  section: { padding: "0 24px 24px", display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  link: { fontSize: 13, color: "var(--accent)" } satisfies CSSProperties,
  muted: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  h3: { fontSize: 14, fontWeight: 700, margin: "0 0 8px" } satisfies CSSProperties,
  actual: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  actualItem: {
    fontSize: 13,
    padding: 10,
    border: "1px solid var(--border)",
    borderRadius: 8,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  } satisfies CSSProperties,
} as const;
