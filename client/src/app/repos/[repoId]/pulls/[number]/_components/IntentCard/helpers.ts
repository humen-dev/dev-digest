import type { IntentConfidence, IntentSource, IntentUnresolvedReason } from "@devdigest/shared";
import { CONFIDENCE_TONE, SHORT_SHA_LENGTH } from "./constants";

/** Badge color + background for a confidence level. */
export function confidenceTone(confidence: IntentConfidence): { color: string; bg: string } {
  return CONFIDENCE_TONE[confidence];
}

/** First `SHORT_SHA_LENGTH` chars of a commit SHA; "—" when missing. */
export function shortSha(sha: string | null | undefined): string {
  if (!sha) return "—";
  return sha.slice(0, SHORT_SHA_LENGTH);
}

/** Sources the classifier could not use, in the order they were recorded. */
export function unresolvedSources(sources: IntentSource[]): IntentSource[] {
  return sources.filter((source) => source.status === "unresolved");
}

/** i18n key (relative to the `intentCard` block) for an unresolved source's reason. */
export function reasonKey(reason: IntentUnresolvedReason): string {
  return `reason.${reason}`;
}
