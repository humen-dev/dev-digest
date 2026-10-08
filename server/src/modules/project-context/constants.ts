/**
 * Constants for the project-context module (SPEC-01).
 */

/** List endpoint cap — the first 500 docs in path order; `total` carries the real count (EC-5). */
export const MAX_LISTED_DOCS = 500;

/**
 * `estimated_tokens` heuristic (list + content endpoints): `ceil(bytes / 4)`.
 * Distinct from `resolveEffective`'s COUNTED tokens, which run the real
 * `TokenCounter` over a document's text (Decision C).
 */
export const ESTIMATED_TOKENS_BYTES_PER_TOKEN = 4;
