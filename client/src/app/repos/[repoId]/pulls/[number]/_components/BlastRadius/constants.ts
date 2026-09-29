import type { BlastDegradedReason } from "@devdigest/shared";

/** Symbol rows expanded on first render. */
export const DEFAULT_EXPANDED_ROWS = 3;
/** Refetch interval after a resync while the map is still degraded. */
export const BLAST_RESYNC_POLL_MS = 3000;
/** Max refetches after a resync before polling gives up. */
export const BLAST_RESYNC_POLL_MAX = 40;

/** Reasons that have a message in blast.json (no value import from shared). */
export const BLAST_REASONS = [
  "flag_off",
  "index_failed",
  "index_partial",
  "repo_too_large",
  "no_data",
] as const satisfies readonly BlastDegradedReason[];

/** Card views: the expandable tree (default) or the SVG graph. */
export const BLAST_VIEWS = ["tree", "graph"] as const;
export type BlastView = (typeof BLAST_VIEWS)[number];
export const DEFAULT_VIEW: BlastView = "tree";
