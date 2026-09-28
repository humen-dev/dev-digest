import { describe, it, expect, beforeEach } from 'vitest';
import { SmartDiffService } from '../src/modules/smart-diff/service.js';
import { NotFoundError } from '../src/platform/errors.js';
import { InMemorySmartDiffRepo, newId } from './helpers/smart-diff-fakes.js';

const WORKSPACE = 'w1';

describe('SmartDiffService', () => {
  let repo: InMemorySmartDiffRepo;
  let service: SmartDiffService;
  let prId: string;

  beforeEach(() => {
    repo = new InMemorySmartDiffRepo();
    service = new SmartDiffService({ smartDiff: repo });
    prId = newId();
    repo.seedPull(WORKSPACE, prId);
    repo.seedFiles(prId, [{ path: 'src/config.ts', additions: 4, deletions: 0 }]);
  });

  it('throws NotFoundError for a PR outside the workspace (or unknown)', async () => {
    await expect(service.get('other-workspace', prId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('returns finding_lines: [] for every file when there are zero reviews', async () => {
    const result = await service.get(WORKSPACE, prId);
    expect(result.groups[0]!.files[0]!.finding_lines).toEqual([]);
  });

  it('excludes dismissed findings from finding_lines', async () => {
    const reviewId = newId();
    repo.seedReview(prId, { id: reviewId, agentId: null, createdAt: new Date('2026-01-01T00:00:00Z') });
    repo.seedFinding(reviewId, { file: 'src/config.ts', startLine: 12, dismissedAt: new Date('2026-01-02T00:00:00Z') });
    repo.seedFinding(reviewId, { file: 'src/config.ts', startLine: 20, dismissedAt: null });

    const result = await service.get(WORKSPACE, prId);
    expect(result.groups[0]!.files[0]!.finding_lines).toEqual([20]);
  });

  it('excludes findings from a superseded review (same agent, older run)', async () => {
    const oldReviewId = newId();
    const newReviewId = newId();
    repo.seedReview(prId, { id: oldReviewId, agentId: 'agent-a', createdAt: new Date('2026-01-01T00:00:00Z') });
    repo.seedReview(prId, { id: newReviewId, agentId: 'agent-a', createdAt: new Date('2026-01-02T00:00:00Z') });
    repo.seedFinding(oldReviewId, { file: 'src/config.ts', startLine: 99, dismissedAt: null });
    repo.seedFinding(newReviewId, { file: 'src/config.ts', startLine: 12, dismissedAt: null });

    const result = await service.get(WORKSPACE, prId);
    expect(result.groups[0]!.files[0]!.finding_lines).toEqual([12]);
  });
});
