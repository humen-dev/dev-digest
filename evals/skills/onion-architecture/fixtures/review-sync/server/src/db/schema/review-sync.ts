import { pgTable, uuid, text, integer, bigint, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { pullRequests } from './pulls';
import { reviews, findings } from './reviews';

export const reviewSyncRuns = pgTable(
  'review_sync_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    prId: uuid('pr_id')
      .notNull()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['running', 'done', 'partial'] }).notNull().default('running'),
    postedCount: integer('posted_count').notNull().default(0),
    skippedCount: integer('skipped_count').notNull().default(0),
    startedAt: now(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => ({
    wsPrIdx: index('review_sync_runs_ws_pr_idx').on(t.workspaceId, t.prId),
  }),
);

export const reviewSyncComments = pgTable(
  'review_sync_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    syncRunId: uuid('sync_run_id')
      .notNull()
      .references(() => reviewSyncRuns.id, { onDelete: 'cascade' }),
    prId: uuid('pr_id')
      .notNull()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    findingId: uuid('finding_id').references(() => findings.id, { onDelete: 'set null' }),
    githubCommentId: bigint('github_comment_id', { mode: 'number' }).notNull(),
    path: text('path').notNull(),
    line: integer('line').notNull(),
    fingerprint: text('fingerprint').notNull(),
    missingSince: timestamp('missing_since', { withTimezone: true }),
    createdAt: now(),
  },
  (t) => ({
    fpUq: uniqueIndex('review_sync_comments_pr_fp_uq').on(t.prId, t.fingerprint),
    runIdx: index('review_sync_comments_run_idx').on(t.syncRunId),
  }),
);
