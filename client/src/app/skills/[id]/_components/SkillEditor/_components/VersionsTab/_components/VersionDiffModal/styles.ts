import type { CSSProperties } from "react";

/** Co-located styles for VersionDiffModal. */
export const s = {
  body: { display: "flex", flexDirection: "column", padding: "8px 0" } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", padding: "16px 24px" } satisfies CSSProperties,
} as const;
