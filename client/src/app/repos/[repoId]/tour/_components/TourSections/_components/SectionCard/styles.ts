import type { CSSProperties } from "react";

/** Chevron rotates 90deg when the section is expanded (matches RoleGroup's
 *  accordion precedent, `pulls/[number]/_components/DiffTab/_components/RoleGroup/styles.ts`). */
export function chevronFor(expanded: boolean): CSSProperties {
  return {
    color: "var(--text-muted)",
    transform: expanded ? "rotate(90deg)" : "none",
    transition: "transform .12s",
    flexShrink: 0,
  };
}

export const s = {
  card: {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    // Keeps a TOC jump from landing a fragment under sticky page chrome.
    scrollMarginTop: 16,
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "var(--card-pad, 14px)",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    textAlign: "left",
    font: "inherit",
    color: "inherit",
  } satisfies CSSProperties,
  iconWrap: {
    display: "inline-flex",
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    background: "var(--accent-bg)",
    color: "var(--accent-text)",
    flexShrink: 0,
  } satisfies CSSProperties,
  title: { flex: 1, fontSize: 15, fontWeight: 650, color: "var(--text-primary)" } satisfies CSSProperties,
  body: {
    padding: "0 var(--card-pad, 14px) var(--card-pad, 14px)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  emptyText: { fontSize: 13, color: "var(--text-secondary)", margin: 0 } satisfies CSSProperties,
} as const;
