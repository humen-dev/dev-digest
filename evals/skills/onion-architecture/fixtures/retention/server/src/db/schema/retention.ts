import { pgTable, uuid, integer, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';

export const retentionPolicies = pgTable(
  'retention_policies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    keepDays: integer('keep_days').notNull().default(90),
    keepLatestPerPr: integer('keep_latest_per_pr').notNull().default(1),
    lastSweptAt: timestamp('last_swept_at', { withTimezone: true }),
    createdAt: now(),
  },
  (t) => ({
    uq: uniqueIndex('retention_ws_repo_uq').on(t.workspaceId, t.repoId),
  }),
);
