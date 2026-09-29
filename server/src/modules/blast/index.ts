/**
 * blast module barrel — re-exports only pure symbols; routes/service/repository
 * stay module-internal (docs/plans/blast-radius.md).
 */
export * from './types.js';
export { buildBlastRadius } from './domain/build-blast-radius.js';
export { resolveDegradation } from './domain/degradation.js';
export { formatBlastSummary } from './domain/summary.js';
