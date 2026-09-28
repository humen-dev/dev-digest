import type { CSSProperties } from "react";

/** Chevron rotates 90deg when the group is open. */
export function chevronFor(open: boolean): CSSProperties {
  return {
    color: "var(--text-muted)",
    transform: open ? "rotate(90deg)" : "none",
    transition: "transform .12s",
  };
}

/** Coloured square identifying the role (docs/plans/smart-diff.md Decision 13). */
export function swatchFor(color: string): CSSProperties {
  return { width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 };
}

/** Co-located styles for RoleGroup. */
export const s = {
  group: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    marginBottom: 12,
    // `clip`, not `hidden`: hidden makes the group a scroll container, which
    // would pin the sticky header to the group instead of the page (<main>).
    overflow: "clip",
  } satisfies CSSProperties,
  header: {
    // Stays at the top of the scrolling <main> while its group's files scroll by.
    position: "sticky",
    top: 0,
    zIndex: 2,
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 14px",
    background: "var(--bg-elevated)",
    border: "none",
    cursor: "pointer",
    textAlign: "left",
    font: "inherit",
    color: "inherit",
  } satisfies CSSProperties,
  label: { fontSize: 13, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  description: { fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  right: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 12,
    color: "var(--text-secondary)",
    flexShrink: 0,
  } satisfies CSSProperties,
  flagged: { color: "var(--crit)", fontWeight: 600 } satisfies CSSProperties,
  body: {
    padding: "10px 12px",
    borderTop: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
} as const;
