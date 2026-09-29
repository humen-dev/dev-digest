import type { BlastDegradedReason } from '@devdigest/shared';
import type { DegradedReason } from '../repo-intel/types.js';

/**
 * Ring-1 types for the blast module (docs/plans/blast-radius.md §3.3).
 * Compile-time guard: every repo-intel `DegradedReason` must be a valid
 * `BlastDegradedReason`, so the response serializer can never reject a reason.
 */
type ReasonOk = DegradedReason extends BlastDegradedReason ? true : never;
export const REASON_CONTRACT_OK: ReasonOk = true;

export interface BuildBlastOptions {
  maxCallersPerSymbol: number;
  bfsDepth: number;
  degraded: boolean;
  reason: BlastDegradedReason | null;
}
