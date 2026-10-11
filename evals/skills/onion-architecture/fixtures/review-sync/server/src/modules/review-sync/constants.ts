export const RECHECK_JOB_KIND = 'review-sync.recheck';
export const MAX_COMMENTS_PER_SYNC = 30;
export const MIN_CONFIDENCE = 0.6;

export const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export const SYNC_STATUSES = ['running', 'done', 'partial'] as const;
