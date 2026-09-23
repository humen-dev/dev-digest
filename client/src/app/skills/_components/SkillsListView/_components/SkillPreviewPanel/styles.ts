import type { CSSProperties } from "react";

/** Co-located styles for SkillPreviewPanel. */
export const s = {
  meta: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  description: { fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.55, margin: "14px 0 0" } satisfies CSSProperties,
  body: {
    marginTop: 18,
    padding: "16px 18px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-primary)",
    fontSize: 13.5,
    lineHeight: 1.6,
  } satisfies CSSProperties,
  empty: { color: "var(--text-muted)" } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
} as const;
