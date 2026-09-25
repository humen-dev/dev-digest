import type { ConventionCandidate } from "@devdigest/shared";
import { CONFIDENCE_OK_MIN, CONFIDENCE_WARN_MIN } from "./constants";

/** Board split: pending + accepted are triaged in the list, rejected live in a collapsed section. */
export function splitCandidates(candidates: readonly ConventionCandidate[]): {
  active: ConventionCandidate[];
  rejected: ConventionCandidate[];
} {
  return {
    active: candidates.filter((c) => c.status !== "rejected"),
    rejected: candidates.filter((c) => c.status === "rejected"),
  };
}

export function acceptedIds(candidates: readonly ConventionCandidate[]): string[] {
  return candidates.filter((c) => c.status === "accepted").map((c) => c.id);
}

export function pendingIds(candidates: readonly ConventionCandidate[]): string[] {
  return candidates.filter((c) => c.status === "pending").map((c) => c.id);
}

/** 1-based inclusive line range the snippet covers. */
export function evidenceRange(c: Pick<ConventionCandidate, "evidence_line" | "evidence_snippet">): {
  start: number;
  end: number;
} {
  const lines = c.evidence_snippet ? c.evidence_snippet.split("\n").length : 1;
  return { start: c.evidence_line, end: c.evidence_line + lines - 1 };
}

/** `path:12` or `path:12-18`, as shown in the evidence header. */
export function evidenceLabel(c: Pick<ConventionCandidate, "evidence_path" | "evidence_line" | "evidence_snippet">): string {
  const { start, end } = evidenceRange(c);
  return `${c.evidence_path}:${end > start ? `${start}-${end}` : start}`;
}

export function confidencePercent(confidence: number): number {
  return Math.round(Math.max(0, Math.min(1, confidence)) * 100);
}

/** Bar colour for a confidence percent: ≥85 ok, ≥65 warn, otherwise muted. */
export function confidenceColor(pct: number): string {
  if (pct >= CONFIDENCE_OK_MIN) return "var(--ok)";
  if (pct >= CONFIDENCE_WARN_MIN) return "var(--warn)";
  return "var(--text-muted)";
}
