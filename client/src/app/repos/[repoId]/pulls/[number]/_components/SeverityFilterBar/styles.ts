import type { CSSProperties } from "react";

/** Co-located styles for SeverityFilterBar. */
export const s = {
  bar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    margin: "4px 0 14px",
    flexWrap: "wrap",
  } satisfies CSSProperties,
  sep: {
    color: "var(--text-muted)",
    fontSize: 13,
    userSelect: "none",
  } satisfies CSSProperties,
} as const;

/** Chip style, tinted by the severity colour and its active/disabled state. */
export function chipStyle(color: string, active: boolean, disabled: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12.5,
    fontWeight: 600,
    letterSpacing: 0.2,
    cursor: disabled ? "default" : "pointer",
    border: `1px solid ${active ? color : "var(--border)"}`,
    background: active ? `color-mix(in srgb, ${color} 16%, transparent)` : "transparent",
    color: disabled ? "var(--text-muted)" : color,
    opacity: disabled ? 0.45 : 1,
    transition: "background .12s, border-color .12s",
  };
}
