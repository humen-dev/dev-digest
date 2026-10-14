import { z } from 'zod';
import { CiRepoFullName } from '@devdigest/shared';

/** Module-local request schemas (SPEC-08 §3.7). Private to the `ci` module. */

export const CiSecretsQuery = z.object({ repo: CiRepoFullName });
export type CiSecretsQuery = z.infer<typeof CiSecretsQuery>;
