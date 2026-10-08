import type { CSSProperties } from "react";

/** Co-located styles for DocRow. */
export const s = {
  row: (draggable: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 10px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    cursor: draggable ? "grab" : "default",
  }),
  checkbox: (checked: boolean, disabled: boolean): CSSProperties => ({
    width: 16,
    height: 16,
    flexShrink: 0,
    borderRadius: 4,
    border: "1.5px solid " + (checked ? "var(--accent)" : "var(--border-strong)"),
    background: checked ? "var(--accent)" : "transparent",
    display: "grid",
    placeItems: "center",
    padding: 0,
    opacity: disabled ? 0.6 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
  }),
  fileName: { fontSize: 13, flexShrink: 0 } satisfies CSSProperties,
  folder: { fontSize: 12, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  viaSkill: { fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  tokens: { fontSize: 12, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  dragHandle: { color: "var(--text-muted)", fontSize: 13, width: 14, textAlign: "center", flexShrink: 0 } satisfies CSSProperties,
} as const;
