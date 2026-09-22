import type { CSSProperties } from "react";

/** Co-located styles for PreviewTab. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700, marginBottom: 4 } satisfies CSSProperties,
  caption: { fontSize: 13, color: "var(--text-muted)", marginBottom: 16 } satisfies CSSProperties,
  card: {
    padding: 20,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  untrustedNotice: {
    display: "flex",
    gap: 8,
    alignItems: "flex-start",
    fontSize: 12.5,
    color: "var(--warn)",
    background: "var(--warn-bg)",
    border: "1px solid var(--warn)",
    borderRadius: 7,
    padding: "10px 12px",
    marginTop: 14,
    lineHeight: 1.5,
  } satisfies CSSProperties,
} as const;
