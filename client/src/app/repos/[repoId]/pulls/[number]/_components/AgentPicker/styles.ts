import type { CSSProperties } from "react";

export const s = {
  trigger: { display: "inline-flex" } satisfies CSSProperties,
  panel: {
    position: "fixed",
    overflowY: "auto",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    borderRadius: 9,
    boxShadow: "var(--shadow-modal)",
    zIndex: 60,
    animation: "ddpop .12s ease",
  } satisfies CSSProperties,
} as const;
