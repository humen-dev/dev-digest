import { and, desc, eq, inArray } from 'drizzle-orm';
import type { ConventionStatus } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillAuditRepositoryPort } from './ports.js';
import type { AuditFinding, NewFinding } from './types.js';

type Row = typeof t.skillAuditFindings.$inferSelect;

function toFinding(row: Row): AuditFinding {
  return {
    id: row.id,
    skillId: row.skillId,
    kind: row.kind,
    ref: row.ref,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

export class DrizzleSkillAuditRepository implements SkillAuditRepositoryPort {
  constructor(private readonly db: Db) {}

  async listByRepo(workspaceId: string, repoId: string): Promise<AuditFinding[]> {
    const rows = await this.db
      .select()
      .from(t.skillAuditFindings)
      .where(and(eq(t.skillAuditFindings.workspaceId, workspaceId), eq(t.skillAuditFindings.repoId, repoId)))
      .orderBy(desc(t.skillAuditFindings.createdAt));
    return rows.map(toFinding);
  }

  async getMany(workspaceId: string, ids: string[]): Promise<AuditFinding[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select()
      .from(t.skillAuditFindings)
      .where(and(eq(t.skillAuditFindings.workspaceId, workspaceId), inArray(t.skillAuditFindings.id, ids)));
    return rows.map(toFinding);
  }

  async upsertPending(workspaceId: string, repoId: string, findings: NewFinding[]): Promise<void> {
    if (findings.length === 0) return;
    await this.db
      .insert(t.skillAuditFindings)
      .values(findings.map((f) => ({ workspaceId, repoId, ...f })))
      .onConflictDoNothing();
  }

  async setStatus(workspaceId: string, ids: string[], status: ConventionStatus): Promise<AuditFinding[]> {
    const rows = await this.db
      .update(t.skillAuditFindings)
      .set({ status, decidedAt: new Date() })
      .where(and(eq(t.skillAuditFindings.workspaceId, workspaceId), inArray(t.skillAuditFindings.id, ids)))
      .returning();
    return rows.map(toFinding);
  }
}
