import type { CSSProperties } from "react";

export const s = {
  footer: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  footerLeft: { marginRight: "auto", display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  confirm: { fontSize: 13, fontWeight: 600 } satisfies CSSProperties,
  banner: { padding: "12px 24px 0", margin: 0, fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  extra: { padding: "0 24px 24px" } satisfies CSSProperties,
} as const;
