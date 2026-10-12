import type { CiInstallationState } from '@devdigest/shared';
import { GENERATOR_VERSION } from '../constants.js';

/** AC-58 — derive the installation state from the export PR and ingested runs. */
export function installationState(input: {
  prState: 'open' | 'merged' | 'closed';
  hasIngestedRun: boolean;
}): CiInstallationState {
  if (input.prState === 'merged') return 'active';
  if (input.prState === 'closed') return 'pr_closed';
  return input.hasIngestedRun ? 'active' : 'pr_open';
}

/**
 * AC-60 — outdated when the agent has a newer version than the one exported,
 * or the installed workflow was produced by an older generator. A null
 * installed version is unknown, not outdated.
 */
export function isOutdated(
  inst: { agentVersion: number | null; generatorVersion: number | null },
  agentVersion: number,
): boolean {
  const agentBumped = inst.agentVersion !== null && agentVersion > inst.agentVersion;
  const generatorBumped = inst.generatorVersion !== null && GENERATOR_VERSION > inst.generatorVersion;
  return agentBumped || generatorBumped;
}
