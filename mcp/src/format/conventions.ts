// src/format/conventions.ts — ring 1: pure formatter. Imports only domain/types.ts + errors.ts + format/*.
import type { ApiConvention, ApiConventionBoard, CompactConvention, ConventionsResult } from '../domain/types.js';
import { ToolError } from '../errors.js';
import { clip } from './text.js';

/** The 10 ConventionCategory values (server/src/vendor/shared/contracts/knowledge.ts). */
export const CONVENTION_CATEGORIES = [
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

function toCompact(c: ApiConvention): CompactConvention {
  return {
    rule: clip(c.rule, 200),
    category: c.category,
    evidence: `${c.evidence_path}:${c.evidence_line}`,
    occurrences: c.occurrences,
  };
}

function countByStatus(candidates: ApiConvention[]): Record<'pending' | 'accepted' | 'rejected', number> {
  return {
    pending: candidates.filter((c) => c.status === 'pending').length,
    accepted: candidates.filter((c) => c.status === 'accepted').length,
    rejected: candidates.filter((c) => c.status === 'rejected').length,
  };
}

export interface FormatConventionsOptions {
  repo: string;
  status?: 'accepted' | 'pending' | 'all';
  category?: string;
  limit?: number;
}

/** Formats a repo's ConventionBoard into the compact result the agent receives. */
export function formatConventions(board: ApiConventionBoard, o: FormatConventionsOptions): ConventionsResult {
  const status = o.status ?? 'accepted';
  const limit = o.limit ?? 30;

  if (o.category !== undefined && !(CONVENTION_CATEGORIES as readonly string[]).includes(o.category)) {
    throw new ToolError(
      'invalid_argument',
      `Unknown category "${clip(o.category, 100)}". Valid categories: ${CONVENTION_CATEGORIES.join(', ')}.`,
      `Pass one of: ${CONVENTION_CATEGORIES.join(', ')}.`,
    );
  }

  const categoryFiltered = o.category !== undefined
    ? board.candidates.filter((c) => c.category === o.category)
    : board.candidates;
  const statusFiltered = status === 'all'
    ? categoryFiltered
    : categoryFiltered.filter((c) => c.status === status);

  const sorted = [...statusFiltered].sort((a, b) => {
    const aOcc = a.occurrences ?? -1;
    const bOcc = b.occurrences ?? -1;
    if (aOcc !== bOcc) return bOcc - aOcc;
    return b.confidence - a.confidence;
  });

  const limited = sorted.slice(0, limit);

  let note: string | undefined;
  if (statusFiltered.length === 0 && categoryFiltered.length > 0) {
    const counts = countByStatus(categoryFiltered);
    note = `No ${status} conventions match; found ${counts.pending} pending, ${counts.accepted} accepted, ${counts.rejected} rejected. Pass status: "pending" or "all", or triage them in the DevDigest web UI (Conventions).`;
  }

  const truncated = sorted.length > limited.length
    ? `Showing ${limited.length} of ${sorted.length} conventions; pass limit (max 100) to see more.`
    : undefined;

  return {
    repo: o.repo,
    status,
    category: o.category ?? null,
    total_matching: sorted.length,
    returned: limited.length,
    last_scan_at: board.last_scan?.created_at ?? null,
    conventions: limited.map(toCompact),
    ...(note ? { note } : {}),
    ...(truncated ? { truncated } : {}),
  };
}
