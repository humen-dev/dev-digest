import type { BlastRadiusResponse } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { buildBlastRadius } from './domain/build-blast-radius.js';
import { resolveDegradation } from './domain/degradation.js';
import type { BlastDeps } from './ports.js';

/**
 * Blast radius service — reads the repo-intel index through a narrow port and
 * maps it into the API contract. Read-only; never calls a model.
 */
export class BlastService {
  constructor(private readonly deps: BlastDeps) {}

  /** Throws NotFoundError when the PR is not in the workspace. */
  async get(workspaceId: string, prId: string): Promise<BlastRadiusResponse> {
    const pull = await this.deps.blast.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const files = await this.deps.blast.listChangedFiles(prId);
    const opts = { maxCallersPerSymbol: this.deps.maxCallersPerSymbol };
    if (files.length === 0) {
      // Nothing changed → nothing to look up; avoids a misleading `no_data` + resync hint.
      return buildBlastRadius(
        { changedSymbols: [], callers: [], impactedEndpoints: [] },
        { ...opts, degraded: false, reason: null },
      );
    }

    const [blast, indexState] = await Promise.all([
      this.deps.intel.getBlastRadius(pull.repoId, files),
      this.deps.intel.getIndexState(pull.repoId),
    ]);
    const { degraded, reason } = resolveDegradation(blast, indexState, this.deps.repoIntelEnabled);
    return buildBlastRadius(blast, { ...opts, degraded, reason });
  }
}
