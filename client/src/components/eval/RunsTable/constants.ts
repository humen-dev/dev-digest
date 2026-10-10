/** Column template of the runs table; the optional checkbox column is prepended. */
export const GRID_COLUMNS = "150px 110px 1fr 1fr 1fr 80px 80px 90px";
export const CHECKBOX_COLUMN = "34px";
/** Width of the optional agent-name column (`showAgent`), prepended after the checkbox column. */
export const AGENT_COLUMN = "minmax(90px,130px)";

export const METRIC_COLORS = {
  recall: "var(--accent)",
  precision: "var(--ok)",
  citation: "var(--warn)",
} as const;
