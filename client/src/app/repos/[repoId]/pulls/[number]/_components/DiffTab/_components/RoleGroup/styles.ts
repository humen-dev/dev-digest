import type { CSSProperties } from "react";
import { PR_HEADER_HEIGHT_VAR } from "../../../PrDetailHeader";

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
  // Flat rows, no card chrome (matches the prototype). No overflow on the
  // group: any overflow other than visible/clip would trap the sticky header.
  group: { marginBottom: 2 } satisfies CSSProperties,
  header: {
    // Sticks right under the (itself sticky) PR header while its group's
    // files scroll by — the header publishes its height in this variable.
    position: "sticky",
    top: `var(${PR_HEADER_HEIGHT_VAR}, 0px)`,
    zIndex: 2,
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 14px",
    borderRadius: 8,
    // Page background so the sticky header covers the files scrolling under it.
    background: "var(--bg-primary)",
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
  body: { padding: "4px 0 14px 28px" } satisfies CSSProperties,
} as const;
