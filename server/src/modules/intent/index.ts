/**
 * intent module barrel — PR intent + scope classification.
 */
export * from './types.js';
export * from './constants.js';
export * from './ports.js';
export { IntentService } from './service.js';
export { IntentRepository } from './repository.js';
export { toIntentForReview, toPrIntentRecord } from './mappers.js';
export { default as intentRoutes } from './routes.js';
