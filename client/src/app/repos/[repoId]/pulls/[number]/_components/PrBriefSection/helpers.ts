import { FEATURE_MODELS } from "@/lib/feature-models";
import type {
  BriefContextCandidate,
  BriefProvenance,
  GenerateBriefBody,
  ReviewRecord,
  SecretsStatus,
  Settings,
} from "@devdigest/shared";
import {
  BRIEF_FEATURE_ID,
  FAILED_REASONS,
  KNOWN_MISSING_SOURCES,
  REFUSED_REASONS,
  SHORT_SHA_LENGTH,
} from "./constants";

/** First `SHORT_SHA_LENGTH` chars of a commit SHA; "—" when missing. */
export function shortSha(sha: string | null | undefined): string {
  if (!sha) return "—";
  return sha.slice(0, SHORT_SHA_LENGTH);
}

/** Newest `kind: 'review'` record (summaries never carry a verdict); null when there is none. */
export function latestReview(reviews: readonly ReviewRecord[] | undefined): ReviewRecord | null {
  let best: ReviewRecord | null = null;
  for (const r of reviews ?? []) {
    if (r.kind !== "review") continue;
    if (!best || Date.parse(r.created_at) > Date.parse(best.created_at)) best = r;
  }
  return best;
}

/** Open CRITICAL findings of a review — the "blockers". */
export function reviewBlockers(review: ReviewRecord): number {
  return review.findings.filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length;
}

/** Regenerate re-uses exactly the documents the stored brief was built from. */
export function regenerateBody(provenance: BriefProvenance): GenerateBriefBody {
  return { regenerate: true, context_paths: provenance.context_docs.map((d) => d.path) };
}

/** Provider of the `risk_brief` feature: the settings override, else the registry default. */
export function resolveBriefProvider(settings: Settings | undefined): string {
  const override = settings?.feature_models?.[BRIEF_FEATURE_ID]?.provider;
  if (override) return override;
  return FEATURE_MODELS.find((f) => f.id === BRIEF_FEATURE_ID)?.defaultProvider ?? "openai";
}

/** The provider whose key is missing, or null (unknown status counts as "present"). */
export function missingKeyProvider(
  settings: Settings | undefined,
  secrets: SecretsStatus | undefined,
): string | null {
  if (!secrets) return null;
  const provider = resolveBriefProvider(settings);
  return (secrets as Record<string, boolean>)[provider] === false ? provider : null;
}

export type MissingSourceView =
  | { kind: "known"; key: string }
  | { kind: "degraded"; reason: string }
  | { kind: "unknown"; raw: string };

/** Classify a `missing_sources` value so the view only asks i18n for keys that exist. */
export function parseMissingSource(value: string): MissingSourceView {
  if (value.startsWith("blast_degraded:")) {
    return { kind: "degraded", reason: value.slice("blast_degraded:".length) };
  }
  return KNOWN_MISSING_SOURCES.includes(value) ? { kind: "known", key: value } : { kind: "unknown", raw: value };
}

/** i18n key (under `brief`) explaining a refused / failed outcome; null for an unknown reason. */
export function outcomeReasonKey(status: "refused" | "failed", reason: string | null): string | null {
  if (!reason) return null;
  if (status === "refused") return REFUSED_REASONS.includes(reason) ? `refused.${reason}` : null;
  return FAILED_REASONS.includes(reason) ? `failed.reason.${reason}` : null;
}

/** Paths currently ticked in the picker: the user's choice, else the server's preselection. */
export function effectiveSelection(
  candidates: readonly BriefContextCandidate[],
  picked: readonly string[] | null,
): string[] {
  return picked ? [...picked] : candidates.filter((c) => c.preselected).map((c) => c.path);
}

/** Add or remove `path` from `selection`, keeping order. */
export function toggleSelection(selection: readonly string[], path: string): string[] {
  return selection.includes(path) ? selection.filter((p) => p !== path) : [...selection, path];
}

/** Project documents matching `query` (case-insensitive path substring), minus `exclude`. */
export function searchProjectDocs<T extends { path: string }>(
  docs: readonly T[],
  query: string,
  exclude: ReadonlySet<string>,
  limit: number,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return docs.filter((d) => !exclude.has(d.path) && d.path.toLowerCase().includes(q)).slice(0, limit);
}
