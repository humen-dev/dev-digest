import { z } from 'zod';
import { IntentConfidence } from '@devdigest/shared';
import type { IntentSourceKind, IntentUnresolvedReason } from '@devdigest/shared';

/**
 * Intent classifier — pure input/output shapes.
 *
 * The classifier is a single cheap structured-output call: given WHY a PR
 * exists (title, body, linked issue, plan/spec docs, allowlisted external
 * links) and WHAT changed (files + hunk headers, never hunk bodies), it
 * returns a summary + in/out-of-scope lists + a deterministic-ceiling
 * confidence. No DB, GitHub, or filesystem access here — the server resolves
 * every source and passes plain data in.
 */

/** Structured-output schema the model must satisfy (strict-mode friendly, no `.optional()`). */
export const IntentClassification = z.object({
  intent: z
    .string()
    .describe('One or two sentences: WHY this PR exists, based only on the provided data.'),
  in_scope: z
    .array(z.string())
    .describe('Changes this PR is meant to make, one short phrase per item.'),
  out_of_scope: z
    .array(z.string())
    .describe('Changes explicitly NOT meant to be part of this PR, one short phrase per item.'),
  out_of_scope_files: z
    .array(z.string())
    .describe(
      'Exact paths from the changed-files list that are out of scope for this PR\'s stated purpose. Use the paths verbatim as given; do not invent paths.',
    ),
  missing_context: z
    .array(z.string())
    .describe(
      'What you could not determine because a source was unresolved or absent. Never invent facts to fill a gap — list the gap instead.',
    ),
  confidence: IntentConfidence.describe(
    'How confident you are in the above, based only on how much of it is grounded in the provided data.',
  ),
});
export type IntentClassification = z.infer<typeof IntentClassification>;

/** One changed file, summarized for the prompt — headers only, never hunk bodies. */
export interface IntentChangedFile {
  path: string;
  additions: number;
  deletions: number;
  /** Lines starting with `@@` only (e.g. `@@ -10,7 +10,8 @@ function foo() {`). */
  hunk_headers: string[];
}

/** A `closes/fixes/resolves #N` reference resolved via `GitHubClient.getIssue`. */
export interface IntentLinkedIssue {
  /** e.g. '#12'. */
  ref: string;
  title: string;
  body: string;
}

/** A plan/spec repo file (read at the PR head SHA) or an allowlisted external link. */
export interface IntentDocument {
  kind: 'repo_doc' | 'external_link';
  /** Repo-relative path (repo_doc) or a redacted URL (external_link). */
  ref: string;
  role: 'plan' | 'spec' | 'ticket' | 'doc';
  content: string;
}

/** A source that could not be resolved (never fabricated — listed instead). */
export interface IntentUnresolvedRef {
  kind: IntentSourceKind;
  ref: string;
  reason: IntentUnresolvedReason;
}

export interface IntentClassifierInput {
  pr: { number: number; title: string; body: string | null };
  files: IntentChangedFile[];
  issues: IntentLinkedIssue[];
  documents: IntentDocument[];
  unresolved: IntentUnresolvedRef[];
}
