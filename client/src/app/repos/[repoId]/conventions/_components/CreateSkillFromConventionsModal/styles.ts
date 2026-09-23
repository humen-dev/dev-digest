import type { CSSProperties } from "react";

/** Co-located styles for CreateSkillFromConventionsModal. */
export const s = {
  body: { display: "flex", flexDirection: "column", gap: 16, padding: "20px 24px 24px" } satisfies CSSProperties,
  banner: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  } satisfies CSSProperties,
  bannerRepo: { color: "var(--accent)" } satisfies CSSProperties,
  enabledRow: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  enabledHint: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  footerNote: { flex: 1, fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  loading: { padding: "32px 24px", fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
