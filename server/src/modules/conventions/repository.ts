import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { ConventionStatus } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type {
  ConventionPatch,
  ConventionRow,
  ConventionScanRow,
  ConventionsRepositoryPort,
  InsertConvention,
  InsertConventionScan,
} from './ports.js';

/**
 * Drizzle implementation of the conventions port. Owns the `conventions` and
 * `convention_scans` tables; every query is scoped by workspace (and repo).
 */
export class ConventionsRepository implements ConventionsRepositoryPort {
  constructor(private readonly db: Db) {}

  async listByRepo(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(
        sql`case ${t.conventions.status} when 'accepted' then 0 when 'pending' then 1 else 2 end`,
        sql`${t.conventions.occurrences} desc nulls last`,
        desc(t.conventions.confidence),
        t.conventions.createdAt,
      );
  }

  async latestScan(workspaceId: string, repoId: string): Promise<ConventionScanRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventionScans)
      .where(
        and(eq(t.conventionScans.workspaceId, workspaceId), eq(t.conventionScans.repoId, repoId)),
      )
      .orderBy(desc(t.conventionScans.createdAt))
      .limit(1);
    return row;
  }

  async getById(workspaceId: string, id: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row;
  }

  async update(
    workspaceId: string,
    id: string,
    patch: ConventionPatch,
  ): Promise<ConventionRow | undefined> {
    const set = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    if (Object.keys(set).length === 0) return this.getById(workspaceId, id);
    const [row] = await this.db
      .update(t.conventions)
      .set(set)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }

  async setStatusMany(
    workspaceId: string,
    repoId: string,
    ids: string[],
    status: ConventionStatus,
  ): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .update(t.conventions)
      .set({ status })
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          inArray(t.conventions.id, ids),
        ),
      );
  }

  async replacePending(
    workspaceId: string,
    repoId: string,
    rows: InsertConvention[],
    scan: InsertConventionScan,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(t.conventions)
        .where(
          and(
            eq(t.conventions.workspaceId, workspaceId),
            eq(t.conventions.repoId, repoId),
            eq(t.conventions.status, 'pending'),
          ),
        );
      if (rows.length) await tx.insert(t.conventions).values(rows.map((r) => ({ ...r, status: 'pending' as const })));
      await tx.insert(t.conventionScans).values(scan);
    });
  }
}
