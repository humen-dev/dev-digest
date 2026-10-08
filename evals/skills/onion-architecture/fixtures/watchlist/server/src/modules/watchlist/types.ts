import { z } from 'zod';

export const AddWatchBody = z.object({
  repoId: z.string().uuid(),
  prNumber: z.number().int().positive(),
  note: z.string().max(500).optional(),
});
export type AddWatchBody = z.infer<typeof AddWatchBody>;

export const WatchEntry = z.object({
  id: z.string().uuid(),
  repoId: z.string().uuid(),
  prNumber: z.number().int(),
  note: z.string().nullable(),
  lastSeenSha: z.string().nullable(),
  createdAt: z.string(),
  checkedAt: z.string().nullable(),
});
export type WatchEntry = z.infer<typeof WatchEntry>;

export const WatchStatus = WatchEntry.extend({
  title: z.string(),
  state: z.enum(['open', 'closed', 'merged']),
  hasNewCommits: z.boolean(),
  stale: z.boolean(),
});
export type WatchStatus = z.infer<typeof WatchStatus>;
