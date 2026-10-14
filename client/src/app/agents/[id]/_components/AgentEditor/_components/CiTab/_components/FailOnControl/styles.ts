import type { CSSProperties } from "react";

const option = {
  padding: "5px 12px",
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 5,
  border: "none",
  cursor: "pointer",
  fontFamily: "inherit",
} satisfies CSSProperties;

/** Co-located styles for the Fail CI on control. */
export const s = {
  card: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  text: { minWidth: 0, flex: 1 } satisfies CSSProperties,
  title: { fontSize: 13, fontWeight: 600 } satisfies CSSProperties,
  hint: { fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
  anyHint: { fontSize: 11.5, color: "var(--warn)", marginTop: 4 } satisfies CSSProperties,
  group: {
    display: "flex",
    gap: 2,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 7,
    padding: 2,
    flexShrink: 0,
  } satisfies CSSProperties,
  option: { ...option, background: "transparent", color: "var(--text-muted)" } satisfies CSSProperties,
  optionChecked: { ...option, background: "var(--bg-elevated)", color: "var(--text-primary)" } satisfies CSSProperties,
} as const;
