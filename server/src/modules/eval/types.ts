import { z } from 'zod';
import { EvalCase } from '@devdigest/shared';

/**
 * Module-local request/response shapes for the eval routes (private — other
 * modules never import this file). The eval contracts themselves live in
 * `@devdigest/shared`.
 */

/** Machine-readable codes the eval API puts in `error.code` (mirrored by client `eval.errors.*`). */
export const EVAL_ERROR_CODES = [
  'run_in_flight',
  'no_cases',
  'provider_key_missing',
  'too_many_cases',
  'finding_not_triaged',
  'expectation_outside_diff',
  'frozen_input_too_large',
  'agent_unavailable',
  'diff_unavailable',
  'invalid_compare_pair',
] as const;
export type EvalErrorCode = (typeof EVAL_ERROR_CODES)[number];

/** Result of creating a case from a finding: `created: false` means the finding already had one (HTTP 200). */
export const CreatedFromFinding = z.object({ case: EvalCase, created: z.boolean() });
export type CreatedFromFinding = z.infer<typeof CreatedFromFinding>;
