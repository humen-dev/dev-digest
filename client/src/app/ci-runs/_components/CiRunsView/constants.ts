import type { CiRunsFilterState, CiRunsRange } from "./types";

/** Background (non-forced) refresh cadence while the tab is visible. */
export const AUTO_REFRESH_MS = 30_000;

export const DEFAULT_RANGE: CiRunsRange = "7d";

export const DEFAULT_FILTERS: CiRunsFilterState = {
  range: DEFAULT_RANGE,
  agent: "",
  repo: "",
  status: "",
  source: "",
};

/** Range → look-back window in days (null = all time). */
export const RANGE_DAYS: Record<CiRunsRange, number | null> = { "7d": 7, "30d": 30, all: null };

export const RANGE_ORDER = ["7d", "30d", "all"] as const satisfies readonly CiRunsRange[];
export const RANGE_LABEL_KEY: Record<CiRunsRange, string> = {
  "7d": "last7Days",
  "30d": "last30Days",
  all: "allTime",
};

/** Mirrors `CiRunStatus` / `CiRunsQuery.source` (type-only imports from shared). */
export const STATUS_ORDER = ["succeeded", "no_findings", "failed"] as const;
export const STATUS_LABEL_KEY: Record<(typeof STATUS_ORDER)[number], string> = {
  succeeded: "succeeded",
  no_findings: "noFindings",
  failed: "failed",
};
export const SOURCE_ORDER = ["gha"] as const;

/** Only links under this origin are rendered as anchors. */
export const GITHUB_URL_PREFIX = "https://github.com/";

/** Stand-in "from" for the all-time range (server default would be 7 days). */
export const ALL_TIME_FROM = "1970-01-01T00:00:00.000Z";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export const DAY_MS = 24 * 60 * 60 * 1000;
