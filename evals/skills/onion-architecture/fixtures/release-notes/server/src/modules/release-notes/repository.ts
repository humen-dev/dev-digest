import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { InsertReleaseNote, ReleaseNotesRepositoryPort } from './ports.js';
import type { ReleaseNote } from './types.js';

type Row = typeof t.releaseNotes.$inferSelect;

function toNote(row: Row): ReleaseNote {
  return {
    id: row.id,
    repoId: row.repoId,
    fromRef: row.fromRef,
    toRef: row.toRef,
    status: row.status === 'published' ? 'published' : 'draft',
    markdown: row.markdown,
    createdAt: row.createdAt.toISOString(),
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
  };
}

export class ReleaseNotesRepository implements ReleaseNotesRepositoryPort {
  constructor(private readonly db: Db) {}

  async get(workspaceId: string, id: string): Promise<ReleaseNote | null> {
    const [row] = await this.db
      .select()
      .from(t.releaseNotes)
      .where(and(eq(t.releaseNotes.workspaceId, workspaceId), eq(t.releaseNotes.id, id)));
    return row ? toNote(row) : null;
  }

  async listByRepo(workspaceId: string, repoId: string): Promise<ReleaseNote[]> {
    const rows = await this.db
      .select()
      .from(t.releaseNotes)
      .where(and(eq(t.releaseNotes.workspaceId, workspaceId), eq(t.releaseNotes.repoId, repoId)))
      .orderBy(desc(t.releaseNotes.createdAt));
    return rows.map(toNote);
  }

  async insert(note: InsertReleaseNote): Promise<ReleaseNote> {
    const [row] = await this.db.insert(t.releaseNotes).values(note).returning();
    return toNote(row!);
  }
}
