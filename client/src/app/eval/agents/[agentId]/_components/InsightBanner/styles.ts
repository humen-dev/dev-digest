import type { CSSProperties } from "react";

export const s = {
  banner: (direction: "up" | "down"): CSSProperties => ({
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    borderLeft: `3px solid ${direction === "up" ? "var(--success, #30a46c)" : "var(--danger, #e5484d)"}`,
    background: "var(--bg-surface)",
    fontSize: 13,
  }),
};
