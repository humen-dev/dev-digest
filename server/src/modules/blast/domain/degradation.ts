import type { BlastDegradedReason } from '@devdigest/shared';
import type { BlastResult, IndexState } from '../../repo-intel/types.js';

export interface Degradation {
  degraded: boolean;
  reason: BlastDegradedReason | null;
}

/**
 * The facade tags every degraded blast `no_data` and reports `degraded:false`
 * for a partial index, so blast refines it from the index state (plan §3.2).
 */
export function resolveDegradation(
  blast: Pick<BlastResult, 'degraded' | 'reason'>,
  indexState: Pick<IndexState, 'status' | 'degradedReason'>,
  repoIntelEnabled: boolean,
): Degradation {
  if (!repoIntelEnabled) return { degraded: true, reason: 'flag_off' };
  if (blast.degraded) {
    const reason =
      indexState.degradedReason ?? (indexState.status === 'failed' ? 'index_failed' : (blast.reason ?? 'no_data'));
    return { degraded: true, reason };
  }
  if (indexState.status === 'partial') return { degraded: true, reason: 'index_partial' };
  return { degraded: false, reason: null };
}
