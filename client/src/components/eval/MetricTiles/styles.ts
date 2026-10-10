import type { CSSProperties } from "react";

export const s = {
  strip: { display: "flex", gap: 12 } satisfies CSSProperties,
  tile: {
    flex: 1,
    minWidth: 0,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 9,
    padding: 16,
  } satisfies CSSProperties,
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
    letterSpacing: "0.03em",
  } satisfies CSSProperties,
  valueRow: { display: "flex", alignItems: "baseline", gap: 10, marginTop: 10 } satisfies CSSProperties,
  value: { fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  delta: (tone: "up" | "down" | "flat"): CSSProperties => ({
    fontSize: 13,
    fontWeight: 600,
    color: tone === "up" ? "var(--ok)" : tone === "down" ? "var(--crit)" : "var(--text-muted)",
  }),
};
