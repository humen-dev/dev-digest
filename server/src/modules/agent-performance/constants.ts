const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export const UNKNOWN_AGENT_NAME = 'Unknown agent';
export const UNKNOWN_AGENT_KEY = 'unknown-agent';
export const UNKNOWN_MODEL_LABEL = 'Unknown model';
export const UNKNOWN_MODEL_KEY = 'unknown-model';

/** Period used when `from`/`to` are absent: 720 h (30 days). */
export const DEFAULT_PERIOD_MS = 720 * HOUR_MS;
/** Longest accepted period: 366 days. */
export const MAX_PERIOD_MS = 366 * DAY_MS;

export const RECENT_RUNS_LIMIT = 5;
export const HOUR_BUCKET_COUNT = 24;

/** Run statuses that count towards a period; `running` never does. */
export const COUNTED_STATUSES = ['done', 'failed', 'cancelled'] as const;
export type CountedStatus = (typeof COUNTED_STATUSES)[number];
