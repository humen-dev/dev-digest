import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  doublePrecision,
  integer,
  vector,
  index,
} from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';

// ============================================================ Knowledge / RAG

export const memory = pgTable(
  'memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    scope: text('scope', { enum: ['repo', 'global', 'team'] }).notNull(),
    kind: text('kind', {
      enum: ['decision', 'convention', 'preference', 'fact', 'learning'],
    }).notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    confidence: doublePrecision('confidence'),
    sources: jsonb('sources'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({ wsIdx: index('memory_ws_idx').on(t.workspaceId) }),
);

/** Mirrors `ConventionCategory` in @devdigest/shared (text enum; zod validates at the edge). */
const CONVENTION_CATEGORIES = [
  'naming',
  'structure',
  'imports',
  'error_handling',
  'typing',
  'testing',
  'api',
  'data_access',
  'style',
  'other',
] as const;

export const conventions = pgTable(
  'conventions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    rule: text('rule').notNull(),
    rationale: text('rationale'),
    category: text('category', { enum: CONVENTION_CATEGORIES }).notNull().default('other'),
    evidencePath: text('evidence_path'),
    /** 1-based, as verified by code — never as claimed by the model. */
    evidenceLine: integer('evidence_line'),
    evidenceSnippet: text('evidence_snippet'),
    /** Distinct files matching the rule's literal (ripgrep); null = not measured. */
    occurrences: integer('occurrences'),
    confidence: doublePrecision('confidence'),
    status: text('status', { enum: ['pending', 'accepted', 'rejected'] })
      .notNull()
      .default('pending'),
    createdAt: now(),
  },
  (t) => ({ repoStatusIdx: index('conventions_repo_status_idx').on(t.repoId, t.status) }),
);

/** One row per extraction run: what was sampled, what the gate kept, what it cost. */
export const conventionScans = pgTable(
  'convention_scans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    sampledFiles: jsonb('sampled_files').$type<string[]>().notNull(),
    proposed: integer('proposed').notNull(),
    droppedUngrounded: integer('dropped_ungrounded').notNull(),
    droppedDuplicate: integer('dropped_duplicate').notNull(),
    droppedRare: integer('dropped_rare').notNull(),
    kept: integer('kept').notNull(),
    model: text('model').notNull(),
    /** Real provider-reported cost only (StructuredResult.apiCostUsd), never an estimate. */
    apiCostUsd: doublePrecision('api_cost_usd'),
    headSha: text('head_sha'),
    durationMs: integer('duration_ms').notNull(),
    createdAt: now(),
  },
  (t) => ({ repoCreatedIdx: index('convention_scans_repo_created_idx').on(t.repoId, t.createdAt) }),
);
