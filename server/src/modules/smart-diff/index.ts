/**
 * smart-diff module barrel — files-changed grouped by role. Re-exports only
 * pure symbols; routes/service/repository stay module-internal (docs/plans/smart-diff.md).
 */
export * from './types.js';
export { SMART_DIFF_ROLE_ORDER, SMART_DIFF_ROLE_GLOBS, DEFAULT_SMART_DIFF_ROLE } from './constants.js';
export { classifyFile } from './domain/classify-file.js';
export { buildSmartDiff } from './domain/build-smart-diff.js';
export { latestReviewIdsPerAgent } from './domain/current-findings.js';
