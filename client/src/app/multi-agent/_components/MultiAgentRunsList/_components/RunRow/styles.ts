import type { CSSProperties } from "react";
import { ROW_GRID_COLUMNS } from "../../constants";

export const s = {
  row: {
    display: "grid",
    gridTemplateColumns: ROW_GRID_COLUMNS,
    alignItems: "center",
    gap: 12,
    padding: "11px 14px",
    borderBottom: "1px solid var(--border)",
    color: "var(--text-primary)",
    textDecoration: "none",
    fontSize: 13,
  } satisfies CSSProperties,
  title: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontWeight: 600,
  } satisfies CSSProperties,
  muted: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: "var(--text-secondary)",
    fontSize: 12.5,
  } satisfies CSSProperties,
  agents: { display: "flex", flexWrap: "wrap", gap: "2px 10px", fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  agentStatus: { color: "var(--text-muted)" } satisfies CSSProperties,
  more: { color: "var(--text-muted)" } satisfies CSSProperties,
  state: { fontSize: 12.5, fontWeight: 600 } satisfies CSSProperties,
} as const;
