import { z } from 'zod';

export const GenerateReleaseNotesBody = z.object({
  fromRef: z.string().min(1),
  toRef: z.string().min(1),
});
export type GenerateReleaseNotesBody = z.infer<typeof GenerateReleaseNotesBody>;

export const ReleaseNote = z.object({
  id: z.string().uuid(),
  repoId: z.string().uuid(),
  fromRef: z.string(),
  toRef: z.string(),
  status: z.enum(['draft', 'published']),
  markdown: z.string(),
  createdAt: z.string(),
  publishedAt: z.string().nullable(),
});
export type ReleaseNote = z.infer<typeof ReleaseNote>;

export interface CommitSummary {
  sha: string;
  message: string;
  author: string;
}
