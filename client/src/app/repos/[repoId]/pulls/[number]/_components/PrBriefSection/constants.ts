import type { Verdict } from "@devdigest/shared";

/** First `SHORT_SHA_LENGTH` chars of a commit SHA ("a1b2c3d" style). */
export const SHORT_SHA_LENGTH = 7;

/** Feature id whose model/provider the brief uses (Settings → Models). */
export const BRIEF_FEATURE_ID = "risk_brief";

/** Unit label next to a token count. */
export const TOKEN_UNIT = "tok";

/** Max project documents offered by the picker search. */
export const SEARCH_RESULT_LIMIT = 8;

/** Where a missing provider key is configured. */
export const SETTINGS_MODELS_HREF = "/settings/models";

/** `missing_sources` values that have a `brief.missing.*` message (plain ones; `blast_degraded:<reason>` is parsed). */
export const KNOWN_MISSING_SOURCES: readonly string[] = [
  "intent_not_detected",
  "intent_stale",
  "blast_unavailable",
  "no_linked_issue",
  "linked_issue_unresolved",
  "no_context_docs",
  "pr_body_empty",
  "pr_body_truncated",
  "issue_body_truncated",
];

/** Reasons that have a `brief.refused.*` / `brief.failed.reason.*` message. */
export const REFUSED_REASONS: readonly string[] = ["no_changed_files", "over_budget"];
export const FAILED_REASONS: readonly string[] = ["timeout", "llm_error", "invalid_output", "store_failed"];

/** `prReview.verdict.*` label key per verdict. */
export const VERDICT_LABEL_KEY: Record<Verdict, string> = {
  request_changes: "requestChanges",
  approve: "approve",
  comment: "comment",
};

/** Verdict text colour. */
export const VERDICT_COLOR: Record<Verdict, string> = {
  request_changes: "var(--crit)",
  approve: "var(--ok)",
  comment: "var(--info)",
};
