import type { CSSProperties } from "react";

/** Co-located styles for DiffTab. */
export const s = {
  notice: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    padding: "9px 12px",
    borderRadius: 8,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
    color: "var(--warn)",
    fontSize: 13,
  } satisfies CSSProperties,
  info: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    padding: "9px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--info-bg)",
    color: "var(--text-secondary)",
    fontSize: 13,
  } satisfies CSSProperties,
  skeletonStack: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    marginTop: 4,
  } satisfies CSSProperties,
} as const;
