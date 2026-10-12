import type { CiResultArtifact, RunArtifact, WorkflowRun } from '@devdigest/shared';
import { ARTIFACT_NAME, IGNORED_NO_ARTIFACT_CONCLUSIONS, MAX_ARTIFACT_ZIP_BYTES } from '../constants.js';
import type { CiFailureKey } from './artifact-zip.js';

export type RunOutcome = 'ignore' | { failure: CiFailureKey } | { download: number };

/** Decide, from run + artifact metadata alone, whether an artifact is worth downloading. */
export function decideRunOutcome(
  run: Pick<WorkflowRun, 'status' | 'conclusion'>,
  artifacts: readonly RunArtifact[],
): RunOutcome {
  if (run.status !== 'completed') return 'ignore'; // EC-15

  const artifact = artifacts.find((a) => a.name === ARTIFACT_NAME);
  if (!artifact) {
    const ignored = (IGNORED_NO_ARTIFACT_CONCLUSIONS as readonly (string | null)[]).includes(run.conclusion);
    return ignored ? 'ignore' : { failure: 'noResult' }; // AC-85 / AC-77
  }
  if (artifact.expired) return { failure: 'expired' };
  if (artifact.size_in_bytes > MAX_ARTIFACT_ZIP_BYTES) return { failure: 'tooLarge' };
  return { download: artifact.id };
}

export type CiRunStatusResult =
  | { status: 'succeeded' | 'no_findings' }
  | { status: 'failed'; reason: 'postFailed' };

/** Row status for an accepted artifact. A failed post keeps the counts and verdict (EC-18). */
export function ciRunStatus(artifact: Pick<CiResultArtifact, 'findings_count' | 'post_outcome'>): CiRunStatusResult {
  if (artifact.post_outcome === 'post_failed') return { status: 'failed', reason: 'postFailed' };
  return { status: artifact.findings_count > 0 ? 'succeeded' : 'no_findings' };
}
