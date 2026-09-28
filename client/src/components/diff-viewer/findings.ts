/* findings.ts — pure types + helpers for the review-findings overlay on the
   diff viewer. DiffViewer stays agnostic of finding data beyond this shape:
   the route builds the overlay (from usePrReviews) and hands it down, `card`
   is a slot the route fills with its own FindingCard. No React rendering
   here — that lives in FileCard/CodeLine/UnanchoredFindings. */
import type { ReactNode } from "react";
import type { Severity } from "@devdigest/shared";
import { SEVERITY_RANK } from "./constants";

/** One review finding rendered on the diff. */
export interface DiffFindingMarker {
  id: string;
  path: string;
  /** New-side (RIGHT) line = Finding.start_line. */
  line: number;
  severity: Severity;
  /** Rendered card for this finding — a slot the caller fills (e.g. the route's FindingCard). */
  card: ReactNode;
}

export interface DiffFindingOverlay {
  markers: DiffFindingMarker[];
  /** false hides the cards (inline + outside-diff block) so the diff reads
      clean; the file dot and the line's severity bar/label stay. Default true. */
  showCards?: boolean;
}

function bySeverityThenId(a: DiffFindingMarker, b: DiffFindingMarker): number {
  const diff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
  return diff !== 0 ? diff : a.id.localeCompare(b.id);
}

/** Markers that belong to one file, most severe first (ties broken by id). */
export function markersForPath(
  overlay: DiffFindingOverlay | undefined,
  path: string
): DiffFindingMarker[] {
  if (!overlay) return [];
  return overlay.markers.filter((m) => m.path === path).sort(bySeverityThenId);
}

/**
 * Splits a file's markers into ones anchored to a rendered RIGHT line and the
 * rest ("outside the changed lines" — the line isn't in the patch, or the
 * file has no patch at all). Each bucket stays most-severe-first.
 */
export function anchorMarkers(
  markers: DiffFindingMarker[],
  renderedRightLines: Set<number>
): { byLine: Map<number, DiffFindingMarker[]>; unanchored: DiffFindingMarker[] } {
  const byLine = new Map<number, DiffFindingMarker[]>();
  const unanchored: DiffFindingMarker[] = [];
  for (const m of markers) {
    if (renderedRightLines.has(m.line)) {
      const list = byLine.get(m.line) ?? [];
      list.push(m);
      byLine.set(m.line, list);
    } else {
      unanchored.push(m);
    }
  }
  for (const list of byLine.values()) list.sort(bySeverityThenId);
  unanchored.sort(bySeverityThenId);
  return { byLine, unanchored };
}

/** The most severe severity among markers, or null when empty. */
export function worstSeverity(markers: DiffFindingMarker[]): Severity | null {
  if (markers.length === 0) return null;
  let worst = markers[0]!.severity;
  for (const m of markers) if (SEVERITY_RANK[m.severity] > SEVERITY_RANK[worst]) worst = m.severity;
  return worst;
}
