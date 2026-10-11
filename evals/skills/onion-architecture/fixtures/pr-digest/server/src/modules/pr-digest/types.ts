import { z } from 'zod';
import { SmartDiffRole } from '@devdigest/shared';
import { DEFAULT_DIGEST_DAYS, MAX_DIGEST_DAYS } from './constants.js';

export const DigestQuery = z.object({
  days: z.coerce.number().int().min(1).max(MAX_DIGEST_DAYS).default(DEFAULT_DIGEST_DAYS),
});
export type DigestQuery = z.infer<typeof DigestQuery>;

export const DigestPullItem = z.object({
  prId: z.string().uuid(),
  number: z.number().int(),
  title: z.string(),
  author: z.string(),
  intent: z.string().nullable(),
  roles: z.array(SmartDiffRole),
});
export type DigestPullItem = z.infer<typeof DigestPullItem>;

export const PrDigest = z.object({
  repoId: z.string().uuid(),
  since: z.string(),
  pulls: z.array(DigestPullItem),
  byRole: z.record(SmartDiffRole, z.number().int()),
  activeSkills: z.array(z.string()),
});
export type PrDigest = z.infer<typeof PrDigest>;
