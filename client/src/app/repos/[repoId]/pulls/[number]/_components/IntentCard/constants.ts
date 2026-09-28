import type { IconName } from "@devdigest/ui";
import type { IntentConfidence, IntentSourceKind } from "@devdigest/shared";

/** How many leading chars of a commit SHA to show ("a1b2c3d" style). */
export const SHORT_SHA_LENGTH = 7;

/** Badge tone (color + background) per confidence level. */
export const CONFIDENCE_TONE: Record<IntentConfidence, { color: string; bg: string }> = {
  high: { color: "var(--ok)", bg: "var(--ok-bg)" },
  medium: { color: "var(--warn)", bg: "var(--warn-bg)" },
  low: { color: "var(--text-muted)", bg: "var(--bg-hover)" },
};

/** Decorative icon per source kind — the kind label itself is always the localized text next to it. */
export const SOURCE_KIND_ICON: Record<IntentSourceKind, IconName> = {
  pr_title: "MessageSquare",
  pr_body: "FileText",
  file_list: "File",
  github_issue: "GitPullRequest",
  repo_doc: "FileText",
  external_link: "Link",
};
