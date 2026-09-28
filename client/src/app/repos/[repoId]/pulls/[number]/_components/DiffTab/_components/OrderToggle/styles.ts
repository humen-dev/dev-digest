import type { CSSProperties } from "react";

/** Segmented-control option: the active one is a raised, brighter segment;
    the inactive one is muted text on the track — tokens only. */
export function pillStyle(active: boolean): CSSProperties {
  return {
    border: "none",
    borderRadius: 6,
    padding: "5px 12px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    background: active ? "var(--bg-hover)" : "transparent",
    color: active ? "var(--text-primary)" : "var(--text-muted)",
  };
}

export const s = {
  group: {
    display: "inline-flex",
    gap: 2,
    padding: 3,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
} as const;
