import type { SmartDiffResponse } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { buildSmartDiff } from './domain/build-smart-diff.js';
import { latestReviewIdsPerAgent } from './domain/current-findings.js';
import type { SmartDiffDeps } from './ports.js';
import type { SmartDiffFindingRef } from './types.js';

/**
 * Smart Diff service — files-changed grouped by role, with current-findings
 * anchors (docs/plans/smart-diff.md). Read-only; never calls a model.
 */
export class SmartDiffService {
  constructor(private readonly deps: SmartDiffDeps) {}

  /** Throws NotFoundError when the PR is not in the workspace. */
  async get(workspaceId: string, prId: string): Promise<SmartDiffResponse> {
    const exists = await this.deps.smartDiff.pullExists(workspaceId, prId);
    if (!exists) throw new NotFoundError('Pull request not found');

    const [files, reviews] = await Promise.all([
      this.deps.smartDiff.listPrFiles(prId),
      this.deps.smartDiff.listReviewMeta(prId),
    ]);

    const currentReviewIds = latestReviewIdsPerAgent(reviews);
    const anchors = await this.deps.smartDiff.listFindingAnchors(currentReviewIds);
    const findings: SmartDiffFindingRef[] = anchors
      .filter((a) => a.dismissedAt == null)
      .map((a) => ({ file: a.file, startLine: a.startLine }));

    return buildSmartDiff(files, findings);
  }
}
