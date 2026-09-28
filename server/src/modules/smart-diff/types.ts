/**
 * Plain (ring-1) types for the Smart Diff module — no ORM, no zod needed here.
 * See docs/plans/smart-diff.md §3.4.
 */

export interface SmartDiffSourceFile {
  path: string;
  additions: number;
  deletions: number;
}

export interface SmartDiffFindingRef {
  file: string;
  startLine: number;
}

export interface ReviewMeta {
  id: string;
  agentId: string | null;
  createdAt: Date;
}
