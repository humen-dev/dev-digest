import { pgTable, uuid, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';
import { skills } from './skills';

export const skillAuditFindings = pgTable(
  'skill_audit_findings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['stale_issue', 'missing_file'] }).notNull(),
    ref: text('ref').notNull(),
    status: text('status', { enum: ['pending', 'accepted', 'rejected'] }).notNull().default('pending'),
    createdAt: now(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (t) => ({
    uq: uniqueIndex('skill_audit_ws_skill_kind_ref_uq').on(t.workspaceId, t.skillId, t.kind, t.ref),
    wsRepoIdx: index('skill_audit_ws_repo_idx').on(t.workspaceId, t.repoId),
  }),
);
