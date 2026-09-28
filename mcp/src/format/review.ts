// src/format/review.ts — ring 1: pure formatter. Imports only domain/types.ts + errors.ts + format/*.
import type { ApiFinding, ApiReview, ApiRun, ApiSeverity, CompactFinding, ReviewResult } from '../domain/types.js';
import { clip, firstSentence } from './text.js';

const SEVERITY_RANK: Record<ApiSeverity, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

function loc(finding: ApiFinding): string {
  return finding.start_line === finding.end_line
    ? `${finding.file}:${finding.start_line}`
    : `${finding.file}:${finding.start_line}-${finding.end_line}`;
}

function toCompact(finding: ApiFinding): CompactFinding {
  return {
    loc: loc(finding),
    severity: finding.severity,
    category: finding.category,
    title: clip(finding.title, 120),
    message: clip(firstSentence(finding.rationale), 200),
  };
}

export interface FormatReviewInput {
  repo: string;
  pr: number;
  review: ApiReview;
  run: ApiRun | null;
  minSeverity?: ApiSeverity;
  limit?: number;
  attached?: boolean;
}

/** Formats a persisted review into the compact ReviewResult the agent receives (Decisions 8, 11). */
export function formatReview(i: FormatReviewInput): ReviewResult {
  const limit = i.limit ?? 20;
  const nonDismissed = i.review.findings.filter((f) => f.dismissed_at === null);

  const counts = {
    critical: nonDismissed.filter((f) => f.severity === 'CRITICAL').length,
    warning: nonDismissed.filter((f) => f.severity === 'WARNING').length,
    suggestion: nonDismissed.filter((f) => f.severity === 'SUGGESTION').length,
  };

  const minRank = i.minSeverity ? SEVERITY_RANK[i.minSeverity] : SEVERITY_RANK.SUGGESTION;
  const afterSeverityFilter = nonDismissed.filter((f) => SEVERITY_RANK[f.severity] <= minRank);

  const sorted = [...afterSeverityFilter].sort((a, b) => {
    const rankDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (rankDiff !== 0) return rankDiff;
    const confDiff = b.confidence - a.confidence;
    if (confDiff !== 0) return confDiff;
    return loc(a).localeCompare(loc(b));
  });

  const limited = sorted.slice(0, limit);
  const hiddenBySeverity = nonDismissed.length - afterSeverityFilter.length;
  const cutByLimit = sorted.length - limited.length;

  let truncated: string | undefined;
  if (cutByLimit > 0) {
    truncated = `Showing ${limited.length} of ${sorted.length} findings; pass limit (max 100) or min_severity to change.`;
  } else if (hiddenBySeverity > 0) {
    truncated = `${hiddenBySeverity} finding(s) hidden by min_severity; omit it or lower it to see them.`;
  }

  const blockers = i.run?.blockers ?? null;
  const gate: ReviewResult['gate'] = blockers === null ? null : blockers > 0 ? 'block' : 'pass';

  return {
    status: 'done',
    repo: i.repo,
    pr: i.pr,
    run_id: i.review.run_id,
    agent: i.review.agent_name ?? i.run?.agent_name ?? null,
    ...(i.attached ? { attached: true as const } : {}),
    verdict: i.review.verdict,
    score: i.review.score,
    blockers,
    gate,
    summary: clip(i.review.summary ?? '', 300),
    counts,
    findings: limited.map(toCompact),
    ...(truncated ? { truncated } : {}),
  };
}
