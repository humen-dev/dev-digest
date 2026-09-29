import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { BlastPull, BlastRepositoryPort } from './ports.js';

/** Drizzle implementation of the blast port. Reads `pull_requests` + `pr_files` (owned by `pulls`). */
export class BlastRepository implements BlastRepositoryPort {
  constructor(private readonly db: Db) {}

  async getPull(workspaceId: string, prId: string): Promise<BlastPull | null> {
    const [row] = await this.db
      .select({ id: t.pullRequests.id, repoId: t.pullRequests.repoId })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row ?? null;
  }

  async listChangedFiles(prId: string): Promise<string[]> {
    const rows = await this.db.select({ path: t.prFiles.path }).from(t.prFiles).where(eq(t.prFiles.prId, prId));
    return rows.map((r) => r.path);
  }
}
