import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PrHistoryChangedFile, PrHistoryPull, PrHistoryRepositoryPort } from './ports.js';

/** Drizzle implementation of the pr-history port. Reads `pull_requests`, `repos`, `pr_files`. */
export class PrHistoryRepository implements PrHistoryRepositoryPort {
  constructor(private readonly db: Db) {}

  async getPull(workspaceId: string, prId: string): Promise<PrHistoryPull | null> {
    const [row] = await this.db
      .select({
        id: t.pullRequests.id,
        number: t.pullRequests.number,
        base: t.pullRequests.base,
        headSha: t.pullRequests.headSha,
        owner: t.repos.owner,
        name: t.repos.name,
      })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row ?? null;
  }

  async listChangedFiles(prId: string): Promise<PrHistoryChangedFile[]> {
    const churn = sql<number>`(${t.prFiles.additions} + ${t.prFiles.deletions})`;
    const rows = await this.db
      .select({ path: t.prFiles.path, churn })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
    return rows.map((r) => ({ path: r.path, churn: Number(r.churn) }));
  }
}
