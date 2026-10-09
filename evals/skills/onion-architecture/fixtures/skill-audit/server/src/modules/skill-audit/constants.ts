export const ISSUE_REF_PATTERN = /(^|[^\w&])#(\d{1,6})\b/g;
export const MAX_REFS_PER_SKILL = 25;
export const MISSING_FILE_PERCENTILE = 0;
export const REPLACEMENT_SUFFIX = ' (audited)';
export const FINDING_KINDS = ['stale_issue', 'missing_file'] as const;
