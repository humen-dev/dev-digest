import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces, users } from './core';
import { repos } from './repos';

export const releaseNotes = pgTable(
  'release_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    fromRef: text('from_ref').notNull(),
    toRef: text('to_ref').notNull(),
    status: text('status').notNull().default('draft'),
    markdown: text('markdown').notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: now(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (t) => ({
    wsRepoIdx: index('release_notes_ws_repo_idx').on(t.workspaceId, t.repoId),
  }),
);

export const releaseNoteEvents = pgTable('release_note_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  releaseNoteId: uuid('release_note_id')
    .notNull()
    .references(() => releaseNotes.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  createdAt: now(),
});
