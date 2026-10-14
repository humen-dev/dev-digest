import type { CSSProperties } from "react";

const SEV_COLOR: Record<string, string> = {
  CRITICAL: "var(--crit)",
  WARNING: "var(--warn)",
  SUGGESTION: "var(--sugg)",
};

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 } satisfies CSSProperties,
  heading: {
    margin: 0,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  toggle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  message: { margin: 0, fontSize: 13.5, color: "var(--text-muted)", padding: "12px 0" } satisfies CSSProperties,
  group: {
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    overflow: "hidden",
  } satisfies CSSProperties,
  groupHead: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    padding: "10px 14px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  location: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  groupTitle: { fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)", overflowWrap: "anywhere" } satisfies CSSProperties,
  takes: { display: "flex", flexWrap: "wrap" } satisfies CSSProperties,
  take: {
    flex: "1 1 200px",
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "10px 14px",
  } satisfies CSSProperties,
  persona: { fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)" } satisfies CSSProperties,
  severity: (severity: string): CSSProperties => ({
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: SEV_COLOR[severity] ?? "var(--text-secondary)",
  }),
  muted: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  status: {
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  note: { fontSize: 12.5, color: "var(--text-muted)", overflowWrap: "anywhere" } satisfies CSSProperties,
} as const;
