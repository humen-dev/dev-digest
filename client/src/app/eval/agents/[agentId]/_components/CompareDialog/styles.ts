import type { CSSProperties } from "react";

export const s = {
  body: { padding: "16px 24px", display: "flex", flexDirection: "column", gap: 18, fontSize: 13 } satisfies CSSProperties,
  h3: { fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: 6 } satisfies CSSProperties,
  metricRow: { display: "grid", gridTemplateColumns: "160px 1fr", gap: 12, padding: "4px 0" } satisfies CSSProperties,
  list: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  muted: { color: "var(--text-muted)" } satisfies CSSProperties,
  diff: {
    margin: 0,
    maxHeight: 260,
    overflow: "auto",
    border: "1px solid var(--border)",
    borderRadius: 7,
    background: "var(--bg-surface)",
    fontSize: 12,
  } satisfies CSSProperties,
  diffLine: (op: "add" | "remove" | "same"): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: "20px 1fr",
    padding: "1px 8px",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    background:
      op === "add" ? "rgba(48,164,108,0.15)" : op === "remove" ? "rgba(229,72,77,0.15)" : "transparent",
    color: op === "same" ? "var(--text-secondary)" : "var(--text-primary)",
  }),
  error: { color: "var(--danger, #e5484d)" } satisfies CSSProperties,
};
