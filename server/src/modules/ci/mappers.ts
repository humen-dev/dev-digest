import type { CiFailOn, CiInstallationState, CiPostAs, CiRun, CiRunStatus, CiTarget, CiTrigger, Verdict } from '@devdigest/shared';
import type * as t from '../../db/schema.js';
import type { CiInstallationRecord } from './ports.js';

export type CiInstallationRow = typeof t.ciInstallations.$inferSelect;
export type CiRunRow = typeof t.ciRuns.$inferSelect;

export function toInstallationRecord(row: CiInstallationRow): CiInstallationRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    agentId: row.agentId,
    repo: row.repo,
    targetType: row.targetType as CiTarget,
    githubRepoId: row.githubRepoId,
    manifestSlug: row.manifestSlug,
    triggers: (row.triggers ?? []) as CiTrigger[],
    postAs: row.postAs as CiPostAs | null,
    workflowVersion: row.workflowVersion,
    generatorVersion: row.generatorVersion,
    agentVersion: row.agentVersion,
    exportedCiFailOn: row.exportedCiFailOn as CiFailOn | null,
    prUrl: row.prUrl,
    state: row.state as CiInstallationState | null,
    installedAt: row.installedAt,
    updatedAt: row.updatedAt,
    lastRefreshedAt: row.lastRefreshedAt,
  };
}

/** Readers only select rows with `workspace_id` + `provider_run_id`, so those are non-null here. */
export function toCiRun(row: CiRunRow): CiRun {
  return {
    id: row.id,
    ci_installation_id: row.ciInstallationId,
    provider_run_id: row.providerRunId ?? '',
    repo: row.repo ?? '',
    pr_number: row.prNumber,
    pr_title: row.prTitle,
    pr_url: row.prUrl,
    commit_sha: row.commitSha,
    agent_id: row.agentId,
    agent_name: row.agentName,
    ran_at: (row.ranAt ?? row.ingestedAt ?? new Date(0)).toISOString(),
    status: (row.status ?? 'failed') as CiRunStatus,
    findings_count: row.findingsCount,
    critical: row.critical,
    warning: row.warning,
    suggestion: row.suggestion,
    verdict: row.verdict as Verdict | null,
    blockers: row.blockers,
    cost_usd: row.costUsd,
    duration_ms: row.durationMs,
    job_url: row.githubUrl,
    source: 'gha',
    failure_reason: row.failureReason,
    agent_run_id: row.agentRunId,
    ingested_at: (row.ingestedAt ?? row.ranAt ?? new Date(0)).toISOString(),
  };
}
