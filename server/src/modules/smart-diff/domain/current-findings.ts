import type { ReviewMeta } from '../types.js';

/**
 * Latest `kind='review'` review per agent (null agent = one bucket), union across
 * agents — the same rule the PR list uses (docs/plans/smart-diff.md Decision 6).
 * Ties on `createdAt` break by the larger id (deterministic). Order of the
 * returned ids is irrelevant to callers.
 */
export function latestReviewIdsPerAgent(reviews: ReviewMeta[]): string[] {
  const latestByAgent = new Map<string, ReviewMeta>();
  for (const review of reviews) {
    const bucketKey = review.agentId ?? '';
    const current = latestByAgent.get(bucketKey);
    if (!current || isNewer(review, current)) latestByAgent.set(bucketKey, review);
  }
  return [...latestByAgent.values()].map((r) => r.id);
}

function isNewer(candidate: ReviewMeta, current: ReviewMeta): boolean {
  const candidateTime = candidate.createdAt.getTime();
  const currentTime = current.createdAt.getTime();
  if (candidateTime !== currentTime) return candidateTime > currentTime;
  return candidate.id > current.id;
}
