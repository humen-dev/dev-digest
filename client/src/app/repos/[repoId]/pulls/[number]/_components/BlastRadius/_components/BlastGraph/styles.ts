import type { CSSProperties } from "react";

export const nodeStyles = {
  symbol: { fill: "var(--accent-bg)", stroke: "var(--accent)", strokeWidth: 1.25 },
  caller: { fill: "var(--bg-elevated)", stroke: "var(--border-strong)", strokeWidth: 1.25 },
  endpoint: { fill: "var(--accent-bg)", stroke: "var(--accent)", strokeWidth: 1.25 },
  cron: { fill: "var(--warn-bg)", stroke: "var(--warn)", strokeWidth: 1.25 },
  more: { fill: "transparent", stroke: "var(--border-strong)", strokeWidth: 1, strokeDasharray: "3 3" },
} as const;

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  svg: { display: "block", width: "100%", height: "auto" } satisfies CSSProperties,
  edge: { fill: "none", stroke: "var(--border-strong)", strokeWidth: 1.25 } satisfies CSSProperties,
  text: { fill: "var(--text-primary)", fontSize: 12 } satisfies CSSProperties,
  legend: {
    display: "flex",
    flexWrap: "wrap",
    gap: 16,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  legendItem: { display: "inline-flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  swatchSymbol: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    border: "2px solid var(--accent)",
  } satisfies CSSProperties,
  swatchCaller: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    border: "2px solid var(--border-strong)",
  } satisfies CSSProperties,
  swatchCron: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    border: "2px solid var(--warn)",
  } satisfies CSSProperties,
  note: { fontSize: 12.5, color: "var(--text-secondary)", margin: 0 } satisfies CSSProperties,
  empty: { fontSize: 13.5, color: "var(--text-secondary)", margin: 0 } satisfies CSSProperties,
} as const;
