import type { CSSProperties } from "react";

/** Co-located styles for the skill Context tab. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  headerRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 4 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  hint: { fontSize: 13, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.5 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  capNote: { fontSize: 12, color: "var(--text-muted)", marginTop: 8 } satisfies CSSProperties,
  skeletonWrap: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  serializeCard: {
    marginTop: 20,
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-surface)",
    padding: 16,
  } satisfies CSSProperties,
  serializeTitle: { fontSize: 13, fontWeight: 700, marginBottom: 10 } satisfies CSSProperties,
  bucketHeading: { fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", marginTop: 10 } satisfies CSSProperties,
  bucketList: { margin: "4px 0 0", paddingLeft: 18, fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
