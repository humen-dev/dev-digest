import type { CSSProperties } from "react";

/** Co-located styles for CreateSkillFromConventionsModal. */
export const s = {
  body: { display: "flex", flexDirection: "column", gap: 4, padding: "16px 20px 8px" } satisfies CSSProperties,
  banner: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "10px 12px",
    marginBottom: 16,
    borderRadius: 8,
    border: "1px solid var(--accent)",
    background: "var(--accent-bg)",
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.45,
  } satisfies CSSProperties,
  bannerIcon: { color: "var(--accent)", flexShrink: 0, marginTop: 2 } satisfies CSSProperties,
  bannerRepo: { color: "var(--accent-text)" } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  footerNote: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  loading: { padding: "32px 24px", fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
