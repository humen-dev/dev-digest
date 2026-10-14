import type { CSSProperties } from "react";

const SEV_COLOR: Record<string, string> = {
  CRITICAL: "var(--crit)",
  WARNING: "var(--warn)",
  SUGGESTION: "var(--sugg)",
};

const STATUS_COLOR: Record<string, string> = {
  running: "var(--accent)",
  done: "var(--ok)",
  failed: "var(--crit)",
  cancelled: "var(--text-muted)",
};

export const s = {
  grid: (count: number, minWidth: number, scrolls: boolean): CSSProperties => ({
    display: "grid",
    gap: 14,
    gridTemplateColumns: `repeat(${Math.max(count, 1)}, minmax(${minWidth}px, 1fr))`,
    overflowX: scrolls ? "auto" : undefined,
    paddingBottom: 6,
  }),
  column: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    overflow: "hidden",
  } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 10, padding: 14 } satisfies CSSProperties,
  headMain: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  name: {
    fontSize: 14,
    fontWeight: 700,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  status: (status: string): CSSProperties => ({
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: STATUS_COLOR[status] ?? "var(--text-muted)",
  }),
  meta: { fontSize: 12, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
  body: { display: "flex", flexDirection: "column", gap: 8, padding: "0 14px 14px", flex: 1 } satisfies CSSProperties,
  error: {
    padding: "8px 10px",
    borderRadius: 6,
    background: "var(--crit-bg)",
    color: "var(--crit)",
    fontSize: 12.5,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", padding: "8px 0" } satisfies CSSProperties,
  finding: (severity: string): CSSProperties => ({
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "9px 11px",
    borderRadius: 6,
    // All-longhand: mixing `border` with `borderLeft` makes React warn on rerender.
    borderStyle: "solid",
    borderWidth: 1,
    borderLeftWidth: 3,
    borderColor: "var(--border)",
    borderLeftColor: SEV_COLOR[severity] ?? "var(--text-muted)",
    background: "var(--bg-hover)",
  }),
  findingTitle: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)", overflowWrap: "anywhere" } satisfies CSSProperties,
  findingMeta: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    fontSize: 11.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  severity: { fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" } satisfies CSSProperties,
  foot: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 14px",
    borderTop: "1px solid var(--border)",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  trace: {
    padding: 0,
    border: "none",
    background: "transparent",
    color: "var(--accent-text)",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
  } satisfies CSSProperties,
} as const;
