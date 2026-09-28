import type { ReviewMeta, SmartDiffSourceFile } from './types.js';

/**
 * Ports the smart-diff service depends on — NOT the `Container`. Row shapes
 * are plain hand-written interfaces (no ORM import); `SmartDiffRepository`
 * returns values structurally assignable to them.
 */
export interface FindingAnchorRow {
  reviewId: string;
  file: string;
  startLine: number;
  dismissedAt: Date | null;
}

export interface SmartDiffRepositoryPort {
  /** Workspace-scoped existence check on pull_requests. */
  pullExists(workspaceId: string, prId: string): Promise<boolean>;
  listPrFiles(prId: string): Promise<SmartDiffSourceFile[]>;
  /** kind = 'review' only. */
  listReviewMeta(prId: string): Promise<ReviewMeta[]>;
  /** [] for an empty id list, without querying. */
  listFindingAnchors(reviewIds: string[]): Promise<FindingAnchorRow[]>;
}

export interface SmartDiffDeps {
  smartDiff: SmartDiffRepositoryPort;
}
