import { randomUUID } from 'node:crypto';
import type { ConventionStatus } from '@devdigest/shared';
import type {
  ConventionPatch,
  ConventionRow,
  ConventionScanRow,
  ConventionsRepositoryPort,
  InsertConvention,
  InsertConventionScan,
} from '../../src/modules/conventions/ports.js';

/** In-memory conventions port — same semantics as the Drizzle repository, no Postgres. */
export class InMemoryConventionsRepo implements ConventionsRepositoryPort {
  rows: ConventionRow[] = [];
  scans: ConventionScanRow[] = [];
  private clock = 0;

  private tick(): Date {
    this.clock += 1000;
    return new Date(Date.UTC(2026, 8, 23) + this.clock);
  }

  seed(row: Partial<ConventionRow> & Pick<ConventionRow, 'workspaceId' | 'repoId' | 'rule'>): ConventionRow {
    const full: ConventionRow = {
      id: randomUUID(),
      rationale: null,
      category: 'other',
      evidencePath: 'src/a.ts',
      evidenceLine: 1,
      evidenceSnippet: 'const a = 1;',
      occurrences: null,
      confidence: 0.8,
      status: 'pending',
      createdAt: this.tick(),
      ...row,
    };
    this.rows.push(full);
    return full;
  }

  async listByRepo(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.rows.filter((r) => r.workspaceId === workspaceId && r.repoId === repoId);
  }
  async latestScan(workspaceId: string, repoId: string): Promise<ConventionScanRow | undefined> {
    return this.scans.filter((s) => s.workspaceId === workspaceId && s.repoId === repoId).at(-1);
  }
  async getById(workspaceId: string, id: string): Promise<ConventionRow | undefined> {
    return this.rows.find((r) => r.workspaceId === workspaceId && r.id === id);
  }
  async update(workspaceId: string, id: string, patch: ConventionPatch): Promise<ConventionRow | undefined> {
    const row = await this.getById(workspaceId, id);
    if (!row) return undefined;
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) (row as unknown as Record<string, unknown>)[k] = v;
    return row;
  }
  async setStatusMany(workspaceId: string, repoId: string, ids: string[], status: ConventionStatus): Promise<void> {
    for (const r of this.rows) {
      if (r.workspaceId === workspaceId && r.repoId === repoId && ids.includes(r.id)) r.status = status;
    }
  }
  async replacePending(
    workspaceId: string,
    repoId: string,
    rows: InsertConvention[],
    scan: InsertConventionScan,
  ): Promise<void> {
    this.rows = this.rows.filter(
      (r) => !(r.workspaceId === workspaceId && r.repoId === repoId && r.status === 'pending'),
    );
    for (const r of rows) this.rows.push({ ...r, id: randomUUID(), status: 'pending', createdAt: this.tick() });
    this.scans.push({ ...scan, id: randomUUID(), createdAt: this.tick() });
  }
}
