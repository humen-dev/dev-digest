import type { CSSProperties } from "react";

/** Co-located styles for StatsTab. */
export const s = {
  wrap: { maxWidth: 760, display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  tiles: { display: "flex", gap: 12 } satisfies CSSProperties,
  tile: {
    flex: 1,
    padding: "14px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  tileLabel: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  tileVal: { fontSize: 20, fontWeight: 700, marginTop: 6 } satisfies CSSProperties,
  card: {
    padding: 16,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  cardTitle: { fontSize: 13, fontWeight: 700, marginBottom: 10 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  agentRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 0",
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  agentName: { fontSize: 13.5, color: "var(--text-primary)" } satisfies CSSProperties,
} as const;
