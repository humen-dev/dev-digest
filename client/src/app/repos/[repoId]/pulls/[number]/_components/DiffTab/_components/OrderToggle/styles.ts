import type { CSSProperties } from "react";

/** Active/inactive pill styling for the two order options — tokens only. */
export function pillStyle(active: boolean): CSSProperties {
  return {
    border: "1px solid transparent",
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    background: active ? "var(--accent-bg)" : "transparent",
    color: active ? "var(--accent-text)" : "var(--text-secondary)",
    borderColor: active ? "var(--accent)" : "transparent",
  };
}

export const s = {
  group: {
    display: "inline-flex",
    gap: 2,
    padding: 2,
    borderRadius: 999,
    border: "1px solid var(--border)",
  } satisfies CSSProperties,
} as const;
