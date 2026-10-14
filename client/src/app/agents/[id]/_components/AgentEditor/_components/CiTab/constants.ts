import type { CiFailOn } from "@devdigest/shared";

/** The status-check name GitHub shows for the generated workflow (client copy of the server constant). */
export const REQUIRED_CHECK_NAME = "DevDigest Review / review";

/** How many recent CI runs the tab lists. */
export const RECENT_RUNS_LIMIT = 10;

/** "All time" lower bound — the server otherwise defaults `from` to the last 7 days. */
export const ALL_TIME_FROM = "1970-01-01T00:00:00.000Z";

/** How long the copy button shows "Copied". */
export const COPIED_RESET_MS = 1500;

/** The three-way gate control; `any` is settable on the Config tab only. */
export const FAIL_ON_OPTIONS = [
  { value: "critical", labelKey: "failOn.critical" },
  { value: "warning", labelKey: "failOn.warning" },
  { value: "never", labelKey: "failOn.never" },
] as const satisfies readonly { value: CiFailOn; labelKey: string }[];
