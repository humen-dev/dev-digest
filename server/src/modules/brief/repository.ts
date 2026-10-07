import { and, eq } from 'drizzle-orm';
import type { PrBriefRecord } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { BriefIntentRow, BriefPrFile, BriefPull, BriefRepositoryPort } from './ports.js';

/**
 * Drizzle implementation of `BriefRepositoryPort`. Owns the `pr_brief` table
 * (one row per PR; `pr_id` is the primary key and cascades from
 * `pull_requests` — `0000_init.sql:386`, EC-23) and reads the PR facts the
 * brief is built from. Returns plain contract shapes, never rows.
 */
export class DrizzleBriefRepository implements BriefRepositoryPort {
  constructor(private db: Db) {}

  /** Workspace-scoped: a PR of another workspace reads as absent (EC-14). */
  async getPull(workspaceId: string, prId: string): Promise<BriefPull | null> {
    const [row] = await this.db
      .select({ pr: t.pullRequests, repo: t.repos })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.pullRequests.repoId, t.repos.id))
      .where(
        and(
          eq(t.pullRequests.id, prId),
          eq(t.pullRequests.workspaceId, workspaceId),
          eq(t.repos.workspaceId, workspaceId),
        ),
      );
    if (!row) return null;
    return {
      id: row.pr.id,
      workspaceId: row.pr.workspaceId,
      repoId: row.pr.repoId,
      number: row.pr.number,
      title: row.pr.title,
      body: row.pr.body,
      headSha: row.pr.headSha,
      repo: { owner: row.repo.owner, name: row.repo.name, clonePath: row.repo.clonePath },
    };
  }

  async listPrFiles(prId: string): Promise<BriefPrFile[]> {
    const rows = await this.db
      .select({
        path: t.prFiles.path,
        additions: t.prFiles.additions,
        deletions: t.prFiles.deletions,
        patch: t.prFiles.patch,
      })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId))
      .orderBy(t.prFiles.path);
    return rows;
  }

  async getIntent(prId: string): Promise<BriefIntentRow | null> {
    const [row] = await this.db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
    if (!row) return null;
    return {
      intent: row.intent,
      inScope: row.inScope,
      outOfScope: row.outOfScope,
      // Legacy rows carry no head SHA: '' never equals the current head, so they read as stale.
      headSha: row.headSha ?? '',
    };
  }

  async getStored(prId: string): Promise<unknown | null> {
    const [row] = await this.db.select({ json: t.prBrief.json }).from(t.prBrief).where(eq(t.prBrief.prId, prId));
    return row?.json ?? null;
  }

  /** Replace on conflict — a regeneration never grows the table (AC-12). */
  async upsert(prId: string, record: PrBriefRecord): Promise<void> {
    await this.db
      .insert(t.prBrief)
      .values({ prId, json: record })
      .onConflictDoUpdate({ target: t.prBrief.prId, set: { json: record } });
  }
}
