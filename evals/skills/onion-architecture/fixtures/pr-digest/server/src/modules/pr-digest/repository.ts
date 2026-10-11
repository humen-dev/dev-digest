import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { DigestPullRecord, PrDigestRepositoryPort } from './ports.js';

export class DrizzlePrDigestRepository implements PrDigestRepositoryPort {
  constructor(private readonly db: Db) {}

  async listUpdatedSince(
    workspaceId: string,
    repoId: string,
    since: Date,
    limit: number,
  ): Promise<DigestPullRecord[]> {
    const pulls = await this.db
      .select({
        id: t.pullRequests.id,
        number: t.pullRequests.number,
        title: t.pullRequests.title,
        author: t.pullRequests.author,
        updatedAt: t.pullRequests.updatedAt,
      })
      .from(t.pullRequests)
      .where(
        and(
          eq(t.pullRequests.workspaceId, workspaceId),
          eq(t.pullRequests.repoId, repoId),
          gte(t.pullRequests.updatedAt, since),
        ),
      )
      .orderBy(desc(t.pullRequests.updatedAt))
      .limit(limit);
    if (pulls.length === 0) return [];

    const files = await this.db
      .select({ prId: t.prFiles.prId, path: t.prFiles.path })
      .from(t.prFiles)
      .where(inArray(t.prFiles.prId, pulls.map((p) => p.id)));

    const byPull = new Map<string, string[]>();
    for (const f of files) {
      const list = byPull.get(f.prId) ?? [];
      list.push(f.path);
      byPull.set(f.prId, list);
    }
    return pulls.map((p) => ({ ...p, files: byPull.get(p.id) ?? [] }));
  }
}
