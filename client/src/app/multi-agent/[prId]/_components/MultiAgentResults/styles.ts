import type { CSSProperties } from "react";

export const s = {
  page: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
    padding: "24px 28px 44px",
    maxWidth: 1400,
    margin: "0 auto",
    width: "100%",
  } satisfies CSSProperties,
  banner: {
    padding: "10px 14px",
    borderRadius: 8,
    background: "var(--crit-bg)",
    color: "var(--crit)",
    fontSize: 13.5,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  noResults: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: 16,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  noResultsTitle: { fontSize: 15, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  reason: { fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 } satisfies CSSProperties,
  reasonAgent: { fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
} as const;
