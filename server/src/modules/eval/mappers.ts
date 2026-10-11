import type {
  EvalCase,
  EvalCaseMeta,
  EvalCaseOutcome,
  EvalExpectation,
  EvalRunDetail,
  EvalRunMetrics,
  EvalRunRecord,
  EvalSkillRef,
} from '@devdigest/shared';
import type * as t from '../../db/schema.js';

export type EvalCaseRow = typeof t.evalCases.$inferSelect;
export type EvalRunRow = typeof t.evalRuns.$inferSelect;
/** List/dashboard queries never select `per_case` (NFR-3). */
export type EvalRunListRow = Omit<EvalRunRow, 'perCase'>;

export function toEvalCase(row: EvalCaseRow): EvalCase {
  return {
    id: row.id,
    owner_kind: row.ownerKind,
    owner_id: row.ownerId,
    name: row.name,
    notes: row.notes,
    input_diff: row.inputDiff,
    input_files: row.inputFiles as string[],
    input_meta: row.inputMeta as EvalCaseMeta,
    expectation: row.expectedOutput as EvalExpectation,
    source_finding_id: row.sourceFindingId,
    severity: row.severity,
    category: row.category,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

/** Metrics exist only once a run has been scored (`completed`). */
function toMetrics(row: EvalRunListRow): EvalRunMetrics | null {
  if (row.status !== 'completed' || row.casesTotal === null) return null;
  return {
    recall: row.recall,
    precision: row.precision,
    citation_accuracy: row.citationAccuracy,
    cases_passed: row.casesPassed ?? 0,
    cases_total: row.casesTotal,
    cases_errored: row.casesErrored ?? 0,
    uncovered_findings: row.uncoveredFindings ?? 0,
  };
}

export function toRunRecord(row: EvalRunListRow, agentName: string | null): EvalRunRecord {
  return {
    id: row.id,
    agent_id: row.ownerId,
    agent_name: agentName,
    agent_version: row.agentVersion,
    skills_fingerprint: row.skillsFingerprint as EvalSkillRef[],
    // Computed across a run list by the domain (`markSkillsDelta`); never stored.
    skills_delta: false,
    status: row.status,
    error_reason: row.errorReason,
    started_at: row.ranAt.toISOString(),
    finished_at: row.finishedAt ? row.finishedAt.toISOString() : null,
    duration_ms: row.durationMs,
    cost_usd: row.costUsd,
    case_ids: row.caseIds as string[],
    metrics: toMetrics(row),
  };
}

export function toRunDetail(row: EvalRunRow, agentName: string | null): EvalRunDetail {
  const { perCase, ...rest } = row;
  return { ...toRunRecord(rest, agentName), per_case: perCase as EvalCaseOutcome[] };
}
