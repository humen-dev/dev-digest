import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { BlastFileFactsRow, BlastImportEdge, BlastPull, BlastRepositoryPort } from './ports.js';

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

  /** Reverse import lookup — served by `file_edges_repo_to_idx (repo_id, to_file)`. */
  async listImporters(repoId: string, files: string[]): Promise<BlastImportEdge[]> {
    if (files.length === 0) return [];
    return this.db
      .select({ fromFile: t.fileEdges.fromFile, toFile: t.fileEdges.toFile })
      .from(t.fileEdges)
      .where(and(eq(t.fileEdges.repoId, repoId), inArray(t.fileEdges.toFile, files)));
  }

  async getFileFacts(repoId: string, files: string[]): Promise<BlastFileFactsRow[]> {
    if (files.length === 0) return [];
    const rows = await this.db
      .select({ filePath: t.fileFacts.filePath, endpoints: t.fileFacts.endpoints, crons: t.fileFacts.crons })
      .from(t.fileFacts)
      .where(and(eq(t.fileFacts.repoId, repoId), inArray(t.fileFacts.filePath, files)));
    return rows.map((r) => ({
      filePath: r.filePath,
      endpoints: (r.endpoints as string[]) ?? [],
      crons: (r.crons as string[]) ?? [],
    }));
  }
}
