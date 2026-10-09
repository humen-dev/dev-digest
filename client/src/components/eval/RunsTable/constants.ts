/** Column template of the runs table; the optional checkbox column is prepended. */
export const GRID_COLUMNS = "150px 110px 1fr 1fr 1fr 80px 80px 90px";
export const GRID_COLUMNS_SELECTABLE = `34px ${GRID_COLUMNS}`;

export const METRIC_COLORS = {
  recall: "var(--accent)",
  precision: "var(--ok)",
  citation: "var(--warn)",
} as const;
