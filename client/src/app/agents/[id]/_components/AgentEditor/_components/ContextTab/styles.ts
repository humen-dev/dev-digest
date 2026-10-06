import type { CSSProperties } from "react";

/** Co-located styles for the agent Context tab. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  headerRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 4 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  count: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  hint: { fontSize: 13, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.5 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  capNote: { fontSize: 12, color: "var(--text-muted)", marginTop: 8 } satisfies CSSProperties,
  footer: { marginTop: 16, display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  footerTokens: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  footerTokensCritical: { fontSize: 13, color: "var(--crit)", fontWeight: 600 } satisfies CSSProperties,
  footerNote: { fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5, margin: 0 } satisfies CSSProperties,
  skeletonWrap: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
} as const;
