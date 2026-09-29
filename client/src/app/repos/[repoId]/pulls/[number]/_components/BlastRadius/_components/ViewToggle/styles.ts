import type { CSSProperties } from "react";

export function pillStyle(active: boolean): CSSProperties {
  return {
    border: "none",
    borderRadius: 6,
    padding: "4px 12px",
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
