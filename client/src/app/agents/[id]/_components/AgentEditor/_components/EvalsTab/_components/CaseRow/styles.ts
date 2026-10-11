import type { CSSProperties } from "react";

const STATUS_COLOR = { pass: "var(--ok)", fail: "var(--crit)", errored: "var(--warn)" } as const;

export const s = {
  row: {
    display: "grid",
    gridTemplateColumns: "minmax(120px, 260px) 120px 130px minmax(0, 1fr) 80px",
    alignItems: "center",
    gap: 12,
    width: "100%",
    padding: "10px 14px",
    border: "none",
    borderBottom: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text-primary)",
    textAlign: "left",
    cursor: "pointer",
    fontSize: 13,
  } satisfies CSSProperties,
  tags: { color: "var(--text-secondary)" } satisfies CSSProperties,
  expected: { minWidth: 0, display: "flex", fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  status: (status: keyof typeof STATUS_COLOR | null): CSSProperties => ({
    fontWeight: 600,
    color: status ? STATUS_COLOR[status] : "var(--text-muted)",
  }),
} as const;
