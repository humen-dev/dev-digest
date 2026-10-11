import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  doublePrecision,
  check,
  index,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { workspaces } from './core';
import { agents } from './agents';
import { pullRequests } from './pulls';

// ============================================================ Eval / Conformance / Compose

export const evalCases = pgTable(
  'eval_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ownerKind: text('owner_kind', { enum: ['skill', 'agent'] }).notNull(),
    // Agent cases only for now: deleting the agent cascades its cases (AC-75).
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    inputDiff: text('input_diff').notNull(),
    inputFiles: jsonb('input_files').notNull(),
    inputMeta: jsonb('input_meta').notNull(),
    // Holds an `EvalExpectation` (column keeps its original name).
    expectedOutput: jsonb('expected_output').notNull(),
    notes: text('notes'),
    // Triaged finding this case was made from; no FK, the finding may be deleted later.
    sourceFindingId: uuid('source_finding_id'),
    severity: text('severity'),
    category: text('category'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    sourceFindingUq: unique('eval_cases_ws_source_finding_uq').on(t.workspaceId, t.sourceFindingId),
    ownerIdx: index('eval_cases_ws_owner_idx').on(t.workspaceId, t.ownerId),
  }),
);

// One row = one run over an agent's case set; per-case outcomes live in `per_case`.
// No FK to eval_cases: a run keeps its history when a case is deleted (AC-43).
export const evalRuns = pgTable(
  'eval_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ownerKind: text('owner_kind', { enum: ['skill', 'agent'] }).notNull(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['running', 'completed', 'errored'] })
      .notNull()
      .default('running'),
    errorReason: text('error_reason'),
    agentVersion: integer('agent_version').notNull(),
    skillsFingerprint: jsonb('skills_fingerprint').notNull().default([]),
    caseIds: jsonb('case_ids').notNull().default([]),
    casesPassed: integer('cases_passed'),
    casesTotal: integer('cases_total'),
    casesErrored: integer('cases_errored'),
    uncoveredFindings: integer('uncovered_findings'),
    perCase: jsonb('per_case').notNull().default([]),
    // ran_at = started_at.
    ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    // Last progress; stale-run reconcile measures age from here (OQ-1).
    heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }).defaultNow().notNull(),
    recall: doublePrecision('recall'),
    precision: doublePrecision('precision'),
    citationAccuracy: doublePrecision('citation_accuracy'),
    durationMs: integer('duration_ms'),
    costUsd: doublePrecision('cost_usd'),
  },
  (t) => ({
    ownerRanIdx: index('eval_runs_ws_owner_ran_idx').on(t.workspaceId, t.ownerId, t.ranAt.desc()),
    statusCk: check('eval_runs_status_ck', sql`${t.status} IN ('running','completed','errored')`),
    oneRunningUq: uniqueIndex('eval_runs_one_running_uq')
      .on(t.ownerId)
      .where(sql`${t.status} = 'running'`),
  }),
);

export const conformanceChecks = pgTable('conformance_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  specId: text('spec_id').notNull(),
  completenessPct: doublePrecision('completeness_pct'),
  items: jsonb('items'),
});

export const composedReviews = pgTable('composed_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  verdict: text('verdict'),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  githubReviewId: text('github_review_id'),
});
