/**
 * Intent classifier tuning constants — caps that keep the classifier prompt
 * cheap and deterministic. Nothing here is a secret or a magic number picked
 * at call sites; every cap used by `intent/*` lives in this one file.
 */

/** PR body: characters sent to the classifier (author-controlled, capped). */
export const MAX_BODY_CHARS = 4000;
/** One plan/spec/external-link document: characters sent to the classifier. */
export const MAX_DOC_CHARS = 6000;
/** All documents combined (repo docs + external links): total char budget. */
export const MAX_DOCS_TOTAL_CHARS = 18000;
/** Changed files summarized in the prompt. */
export const MAX_FILES = 200;
/** Hunk headers kept per file (the rest are silently dropped, never bodies). */
export const MAX_HUNK_HEADERS_PER_FILE = 20;
/** One hunk header line, characters. */
export const MAX_HUNK_HEADER_CHARS = 160;
/** Linked issue body: characters sent to the classifier. */
export const MAX_ISSUE_BODY_CHARS = 4000;
/** Below this, a PR body is treated as "effectively empty" for confidence clamping. */
export const MIN_BODY_CHARS = 40;

/** json_schema name used for the structured-output request. */
export const INTENT_SCHEMA_NAME = 'IntentClassification';
/** Reprompt-on-error budget for `completeStructured`. */
export const INTENT_MAX_RETRIES = 1;
export const INTENT_TEMPERATURE = 0;
export const INTENT_MAX_TOKENS = 1200;

/** Output list caps applied after clamping (defense against a verbose model). */
export const INTENT_MAX_LIST_ITEMS = 10;
export const INTENT_MAX_ITEM_CHARS = 300;
