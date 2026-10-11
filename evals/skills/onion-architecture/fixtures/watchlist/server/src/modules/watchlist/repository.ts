import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { InsertWatchEntry, WatchlistRepositoryPort } from './ports.js';
import type { WatchEntry } from './types.js';

type Row = typeof t.watchlistEntries.$inferSelect;

function toEntry(row: Row): WatchEntry {
  return {
    id: row.id,
    repoId: row.repoId,
    prNumber: row.prNumber,
    note: row.note,
    lastSeenSha: row.lastSeenSha,
    createdAt: row.createdAt.toISOString(),
    checkedAt: row.checkedAt ? row.checkedAt.toISOString() : null,
  };
}

export class WatchlistRepository implements WatchlistRepositoryPort {
  constructor(private readonly db: Db) {}

  async listByWorkspace(workspaceId: string): Promise<WatchEntry[]> {
    const rows = await this.db
      .select()
      .from(t.watchlistEntries)
      .where(eq(t.watchlistEntries.workspaceId, workspaceId))
      .orderBy(desc(t.watchlistEntries.createdAt));
    return rows.map(toEntry);
  }

  async get(workspaceId: string, id: string): Promise<WatchEntry | null> {
    const [row] = await this.db
      .select()
      .from(t.watchlistEntries)
      .where(and(eq(t.watchlistEntries.workspaceId, workspaceId), eq(t.watchlistEntries.id, id)));
    return row ? toEntry(row) : null;
  }

  async insert(entry: InsertWatchEntry): Promise<WatchEntry> {
    const [row] = await this.db.insert(t.watchlistEntries).values(entry).returning();
    return toEntry(row!);
  }

  async markChecked(workspaceId: string, id: string, sha: string): Promise<void> {
    await this.db
      .update(t.watchlistEntries)
      .set({ lastSeenSha: sha, checkedAt: new Date() })
      .where(and(eq(t.watchlistEntries.workspaceId, workspaceId), eq(t.watchlistEntries.id, id)));
  }

  async remove(workspaceId: string, id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(t.watchlistEntries)
      .where(and(eq(t.watchlistEntries.workspaceId, workspaceId), eq(t.watchlistEntries.id, id)))
      .returning({ id: t.watchlistEntries.id });
    return deleted.length > 0;
  }
}
