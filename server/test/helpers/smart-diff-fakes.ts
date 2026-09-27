import { randomUUID } from 'node:crypto';
import type { FindingAnchorRow, SmartDiffRepositoryPort } from '../../src/modules/smart-diff/ports.js';
import type { ReviewMeta, SmartDiffSourceFile } from '../../src/modules/smart-diff/types.js';

/** In-memory smart-diff port — same semantics as the Drizzle repository, no Postgres. */
export class InMemorySmartDiffRepo implements SmartDiffRepositoryPort {
  private pulls = new Set<string>(); // `${workspaceId}:${prId}`
  private files = new Map<string, SmartDiffSourceFile[]>(); // prId -> files
  private reviews = new Map<string, ReviewMeta[]>(); // prId -> review meta (kind='review' only)
  private anchors = new Map<string, FindingAnchorRow[]>(); // reviewId -> anchors

  seedPull(workspaceId: string, prId: string): void {
    this.pulls.add(`${workspaceId}:${prId}`);
  }

  seedFiles(prId: string, files: SmartDiffSourceFile[]): void {
    this.files.set(prId, files);
  }

  seedReview(prId: string, review: ReviewMeta): void {
    const list = this.reviews.get(prId) ?? [];
    list.push(review);
    this.reviews.set(prId, list);
  }

  seedFinding(reviewId: string, anchor: Omit<FindingAnchorRow, 'reviewId'>): void {
    const list = this.anchors.get(reviewId) ?? [];
    list.push({ reviewId, ...anchor });
    this.anchors.set(reviewId, list);
  }

  async pullExists(workspaceId: string, prId: string): Promise<boolean> {
    return this.pulls.has(`${workspaceId}:${prId}`);
  }

  async listPrFiles(prId: string): Promise<SmartDiffSourceFile[]> {
    return this.files.get(prId) ?? [];
  }

  async listReviewMeta(prId: string): Promise<ReviewMeta[]> {
    return this.reviews.get(prId) ?? [];
  }

  async listFindingAnchors(reviewIds: string[]): Promise<FindingAnchorRow[]> {
    if (reviewIds.length === 0) return [];
    const ids = new Set(reviewIds);
    return [...this.anchors.values()].flat().filter((a) => ids.has(a.reviewId));
  }
}

export function newId(): string {
  return randomUUID();
}
