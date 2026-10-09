import type { PullRow } from '../../db/rows.js';

export type DigestPullRecord = Pick<PullRow, 'id' | 'number' | 'title' | 'author' | 'updatedAt'> & {
  files: string[];
};

export interface PrDigestRepositoryPort {
  listUpdatedSince(
    workspaceId: string,
    repoId: string,
    since: Date,
    limit: number,
  ): Promise<DigestPullRecord[]>;
}
