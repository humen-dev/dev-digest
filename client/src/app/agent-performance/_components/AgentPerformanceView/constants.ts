/** URL `sort` values; any other value falls back to DEFAULT_SORT (UT-2). */
export const SORT_KEYS = ["accept", "runs", "cost", "duration"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDir = "asc" | "desc";

export interface SortState {
  key: SortKey;
  dir: SortDir;
}

/** AC-43: accept rate, descending. */
export const DEFAULT_SORT: SortState = { key: "accept", dir: "desc" };

/** Sortable columns, in table order, with the `table.*` message key of their header. */
export const SORT_COLUMNS = [
  { key: "runs", label: "runs" },
  { key: "cost", label: "avgCost" },
  { key: "duration", label: "avgDuration" },
  { key: "accept", label: "acceptRate" },
] as const satisfies readonly { key: SortKey; label: string }[];

/** Sentinel segment keys from the API (PerfCostSegment.key). */
export const UNKNOWN_AGENT_KEY = "unknown-agent";
export const UNKNOWN_MODEL_KEY = "unknown-model";
