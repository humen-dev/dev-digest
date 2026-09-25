import type { ConventionCandidate, ConventionScan } from '@devdigest/shared';
import type { ConventionRow, ConventionScanRow } from './ports.js';

/** Row → contract mapping for the conventions module. Pure, no I/O. */

export function toConventionDto(row: ConventionRow): ConventionCandidate {
  return {
    id: row.id,
    repo_id: row.repoId ?? '',
    rule: row.rule,
    rationale: row.rationale,
    category: row.category,
    evidence_path: row.evidencePath ?? '',
    evidence_line: row.evidenceLine ?? 1,
    evidence_snippet: row.evidenceSnippet ?? '',
    occurrences: row.occurrences,
    confidence: row.confidence ?? 0,
    status: row.status,
    created_at: row.createdAt.toISOString(),
  };
}

export function toScanDto(row: ConventionScanRow): ConventionScan {
  return {
    id: row.id,
    created_at: row.createdAt.toISOString(),
    sampled_files: row.sampledFiles,
    proposed: row.proposed,
    dropped_ungrounded: row.droppedUngrounded,
    dropped_duplicate: row.droppedDuplicate,
    dropped_rare: row.droppedRare,
    kept: row.kept,
    model: row.model,
    api_cost_usd: row.apiCostUsd,
    head_sha: row.headSha,
    duration_ms: row.durationMs,
  };
}
