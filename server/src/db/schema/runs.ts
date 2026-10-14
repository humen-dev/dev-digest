import { pgTable, uuid, text, integer, jsonb, timestamp, doublePrecision, index, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { workspaces } from './core';
import { agents } from './agents';
import { pullRequests } from './pulls';

// ============================================================ Observability

export const agentRuns = pgTable('agent_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
  prId: uuid('pr_id').references(() => pullRequests.id, { onDelete: 'set null' }),
  ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
  provider: text('provider'),
  model: text('model'),
  durationMs: integer('duration_ms'),
  tokensIn: integer('tokens_in'),
  tokensOut: integer('tokens_out'),
  /** Real provider-reported run cost (USD); null when unpriced/failed. Never an estimate. */
  costUsd: doublePrecision('cost_usd'),
  status: text('status'),
  /** Failure reason when status='failed' (LLM/API error, timeout, quota, …). */
  error: text('error'),
  source: text('source', { enum: ['local', 'ci'] }).notNull().default('local'),
  findingsCount: integer('findings_count'),
  grounding: text('grounding'),
  /** Review score (0-100) for this run; null on failed/cancelled runs. */
  score: integer('score'),
  /** Findings that tripped the agent's gate (severity ≥ ciFailOn). */
  blockers: integer('blockers'),
  /** SPEC-07 — the multi-agent run this agent run belongs to; null for single runs. */
  multiRunId: uuid('multi_run_id').references((): AnyPgColumn => multiAgentRuns.id, { onDelete: 'set null' }),
  /** SPEC-07 — set on every terminal transition (done / failed / cancelled / reaped). */
  finishedAt: timestamp('finished_at', { withTimezone: true }),
}, (t) => ({
  multiRunIdx: index('agent_runs_multi_run_id_idx').on(t.multiRunId),
}));

/** Whole trace of one run as a SINGLE jsonb document. */
export const runTraces = pgTable('run_traces', {
  runId: uuid('run_id')
    .primaryKey()
    .references(() => agentRuns.id, { onDelete: 'cascade' }),
  trace: jsonb('trace').notNull(),
});

export const multiAgentRuns = pgTable('multi_agent_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  wsRanAtIdx: index('multi_agent_runs_ws_ran_at_idx').on(t.workspaceId, t.ranAt.desc()),
  prRanAtIdx: index('multi_agent_runs_pr_ran_at_idx').on(t.prId, t.ranAt.desc()),
}));
