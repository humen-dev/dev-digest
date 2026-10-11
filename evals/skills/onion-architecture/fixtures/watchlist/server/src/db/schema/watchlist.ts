import { pgTable, uuid, integer, text, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces, users } from './core';
import { repos } from './repos';

export const watchlistEntries = pgTable(
  'watchlist_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    prNumber: integer('pr_number').notNull(),
    note: text('note'),
    lastSeenSha: text('last_seen_sha'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: now(),
    checkedAt: timestamp('checked_at', { withTimezone: true }),
  },
  (t) => ({
    uq: uniqueIndex('watchlist_ws_repo_pr_uq').on(t.workspaceId, t.repoId, t.prNumber),
    wsIdx: index('watchlist_ws_idx').on(t.workspaceId),
  }),
);
