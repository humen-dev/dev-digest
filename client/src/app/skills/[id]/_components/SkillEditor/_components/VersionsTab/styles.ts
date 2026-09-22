import type { CSSProperties } from "react";

/** Co-located styles for VersionsTab. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 4 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  caption: { fontSize: 13, color: "var(--text-muted)", marginBottom: 16 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", padding: "16px 0" } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    marginBottom: 8,
  } satisfies CSSProperties,
  date: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  actions: { marginLeft: "auto", display: "flex", gap: 8 } satisfies CSSProperties,
} as const;
