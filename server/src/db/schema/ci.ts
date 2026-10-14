import { desc } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  timestamp,
  doublePrecision,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { workspaces } from './core';
import { agents } from './agents';
import { agentRuns } from './runs';

// SPEC-08 (export to CI) — migration 0020 reshapes both tables additively:
// every new column is nullable or defaulted, except `ci_installations.workspace_id`,
// which 0020 backfills from `agents` before setting NOT NULL.

export const ciInstallations = pgTable(
  'ci_installations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    repo: text('repo').notNull(),
    targetType: text('target_type', { enum: ['gha', 'circle', 'jenkins', 'cli'] }).notNull(),
    /** AC-39 — numeric GitHub repository id, compared on every ingest (AC-75). */
    githubRepoId: bigint('github_repo_id', { mode: 'number' }),
    /** AC-86 — manifest file slug fixed at first export, stable across agent renames. */
    manifestSlug: text('manifest_slug'),
    triggers: jsonb('triggers').$type<string[]>(),
    postAs: text('post_as', { enum: ['github_review', 'pr_comment', 'none'] }),
    workflowVersion: text('workflow_version'),
    generatorVersion: integer('generator_version'),
    agentVersion: integer('agent_version'),
    exportedCiFailOn: text('exported_ci_fail_on', { enum: ['never', 'critical', 'warning', 'any'] }),
    prUrl: text('pr_url'),
    state: text('state', { enum: ['pr_open', 'active', 'pr_closed'] }),
    installedAt: timestamp('installed_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
    /** Per-installation refresh debounce bookkeeping; null before the first refresh. */
    lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }),
  },
  (t) => ({
    // One agent per repository: the runner refuses more than one manifest.
    repoUq: uniqueIndex('ci_installations_repo_uq').on(t.workspaceId, t.repo),
    agentIdx: index('ci_installations_ws_agent_idx').on(t.workspaceId, t.agentId),
  }),
);

export const ciRuns = pgTable(
  'ci_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    ciInstallationId: uuid('ci_installation_id').references(() => ciInstallations.id, {
      onDelete: 'set null',
    }),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    /** Denormalised from the installation so an orphaned run still shows its repo. */
    repo: text('repo'),
    /** GitHub Actions `run.id` — one row per run id regardless of attempt (AC-78). */
    providerRunId: text('provider_run_id'),
    prNumber: integer('pr_number'),
    prTitle: text('pr_title'),
    prUrl: text('pr_url'),
    commitSha: text('commit_sha'),
    agentName: text('agent_name'),
    ranAt: timestamp('ran_at', { withTimezone: true }),
    status: text('status'),
    findingsCount: integer('findings_count'),
    critical: integer('critical'),
    warning: integer('warning'),
    suggestion: integer('suggestion'),
    verdict: text('verdict'),
    blockers: integer('blockers'),
    costUsd: doublePrecision('cost_usd'),
    durationMs: integer('duration_ms'),
    /** The GitHub Actions job URL. */
    githubUrl: text('github_url'),
    source: text('source'),
    failureReason: text('failure_reason'),
    agentRunId: uuid('agent_run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }),
  },
  (t) => ({
    providerRunUq: uniqueIndex('ci_runs_provider_run_uq').on(t.workspaceId, t.providerRunId),
    listIdx: index('ci_runs_list_idx').on(t.workspaceId, desc(t.ranAt)),
    agentIdx: index('ci_runs_agent_idx').on(t.agentId),
  }),
);
