import { z } from 'zod';

export const LinkedIssue = z.object({
  key: z.string(),
  title: z.string(),
  state: z.string(),
  url: z.string().url(),
  assignee: z.string().nullable(),
});
export type LinkedIssue = z.infer<typeof LinkedIssue>;

export const PullIssueLinks = z.object({
  pullId: z.string().uuid(),
  issues: z.array(LinkedIssue),
  unresolved: z.array(z.string()),
});
export type PullIssueLinks = z.infer<typeof PullIssueLinks>;
