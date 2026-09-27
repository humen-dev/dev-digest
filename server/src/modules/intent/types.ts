/**
 * Module-local types for intent's source-gathering domain functions. Public
 * DTOs (`PrIntentRecord`, `IntentForReview`, `IntentSource`, …) live in
 * `@devdigest/shared` — this file never redeclares those.
 */

export interface ExtractedIssueRef {
  /** '#12' */
  ref: string;
  number: number;
}

export interface ExtractedDocRef {
  /** Repo-relative path, exactly as found (body mention or changed-file path). */
  path: string;
  role: 'plan' | 'spec' | 'doc';
}

export interface ExtractedLinkRef {
  /** Original URL (unredacted) — used for the fetch. Redact (`domain/redact.ts`) before logging/persisting. */
  url: string;
  role: 'ticket' | 'doc';
}

/** Count of unique refs found beyond each list's cap — not raw occurrences. */
/** Refs dropped past each cap — reported as `limit_exceeded`, never silently lost. */
export interface ReferenceOverflow {
  /** '#N' refs. */
  issues: string[];
  /** Repo-relative doc paths. */
  docs: string[];
  /** Original (unredacted) URLs — redact before persisting or logging. */
  links: string[];
}

/** Result of `extractReferences` — deduped, capped candidates pulled from a PR body + changed files. */
export interface ExtractedReferences {
  issues: ExtractedIssueRef[];
  docs: ExtractedDocRef[];
  links: ExtractedLinkRef[];
  overflow: ReferenceOverflow;
}
